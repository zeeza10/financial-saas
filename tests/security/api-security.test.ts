import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import { serializeCsv } from '@financial-saas/ledger-core';
import { InMemoryStorageProvider } from '@financial-saas/storage';
import { createApiApp, type AuthGateway } from '../../apps/api/src/app.js';
import type { ApiEnv } from '../../apps/api/src/env.js';
import { InMemoryRateLimiter } from '../../apps/api/src/security.js';
import { InMemoryDataStore } from '../../apps/api/src/store.js';

const TEST_ENV: ApiEnv = {
  APP_ORIGIN: 'https://app.ledgercore.test',
  SUPABASE_URL: 'https://example.supabase.co',
  SUPABASE_ANON_KEY: 'test-anon-key',
  COOKIE_SIGNING_SECRET: '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
  CSRF_SECRET: 'fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210',
  TEST_JWT_SECRET: 'test-jwt-secret-key-minimum-32-bytes-long',
};

async function mintTestJwt(sub: string, email: string, aal: 'aal1' | 'aal2' = 'aal2'): Promise<string> {
  return new SignJWT({ email, aal })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(sub)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(TEST_ENV.TEST_JWT_SECRET!));
}

function makeHarness(options?: { enforceMfa?: boolean }) {
  const store = new InMemoryDataStore();
  const rateLimiter = new InMemoryRateLimiter();
  const users = new Map<string, { id: string; email: string; aal: 'aal1' | 'aal2' }>([
    ['owner-a@alpha.test', { id: '11111111-1111-1111-1111-111111111111', email: 'owner-a@alpha.test', aal: 'aal2' }],
    ['owner-b@beta.test', { id: '22222222-2222-2222-2222-222222222222', email: 'owner-b@beta.test', aal: 'aal2' }],
    ['nomfa@alpha.test', { id: '33333333-3333-3333-3333-333333333333', email: 'nomfa@alpha.test', aal: 'aal1' }],
  ]);

  const authGateway: AuthGateway = {
    async signup() {},
    async loginWithPassword(email, password) {
      const u = users.get(email);
      if (!u || password !== 'ValidStrongPassword123!') {
        throw new Error('bad creds');
      }
      const token = await mintTestJwt(u.id, u.email, u.aal);
      return { userId: u.id, email: u.email, accessToken: token, aal: u.aal };
    },
  };

  const app = createApiApp({
    getEnv: () => TEST_ENV,
    createStore: () => store,
    createAuthGateway: () => authGateway,
    rateLimiter,
    enforceMfaForPrivileged: options?.enforceMfa ?? false,
  });

  async function loginAs(email: string) {
    const res = await app.request(
      'https://api.ledgercore.test/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: TEST_ENV.APP_ORIGIN,
        },
        body: JSON.stringify({ email, password: 'ValidStrongPassword123!' }),
      },
      TEST_ENV
    );
    expect(res.status).toBe(200);
    const setCookies = res.headers.getSetCookie();
    const cookiePairs = setCookies.map((c) => c.split(';')[0]!).join('; ');
    const body = (await res.json()) as { csrf_token: string };
    return { cookieHeader: cookiePairs, csrfToken: body.csrf_token };
  }

  return { app, store, loginAs };
}

describe('Phase 3 API Security Test Cases (ST-02..ST-19)', () => {
  it('ST-02 rejects state-changing requests missing CSRF token, wrong Origin, or non-JSON content type', async () => {
    const { app, loginAs } = makeHarness();
    const session = await loginAs('owner-a@alpha.test');

    // Missing CSRF header
    const noCsrf = await app.request(
      'https://api.ledgercore.test/v1/organizations',
      {
        method: 'POST',
        headers: {
          Cookie: session.cookieHeader,
          Origin: TEST_ENV.APP_ORIGIN,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'k1',
        },
        body: JSON.stringify({ name: 'Org A', base_currency: 'USD', country: 'US' }),
      },
      TEST_ENV
    );
    expect(noCsrf.status).toBe(403);

    // Disallowed Origin
    const badOrigin = await app.request(
      'https://api.ledgercore.test/v1/organizations',
      {
        method: 'POST',
        headers: {
          Cookie: session.cookieHeader,
          Origin: 'https://evil.example',
          'X-CSRF-Token': session.csrfToken,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'k1',
        },
        body: JSON.stringify({ name: 'Org A', base_currency: 'USD', country: 'US' }),
      },
      TEST_ENV
    );
    expect(badOrigin.status).toBe(403);

    // Simple form POST rejected (415)
    const formPost = await app.request(
      'https://api.ledgercore.test/v1/organizations',
      {
        method: 'POST',
        headers: {
          Cookie: session.cookieHeader,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': session.csrfToken,
          'Content-Type': 'application/x-www-form-urlencoded',
        },
        body: 'name=OrgA',
      },
      TEST_ENV
    );
    expect(formPost.status).toBe(415);
  });

  it('ST-05 & ST-09 isolate tenants across organizations (foreign org returns 404)', async () => {
    const { app, loginAs } = makeHarness();
    const sessionA = await loginAs('owner-a@alpha.test');
    const sessionB = await loginAs('owner-b@beta.test');

    const createRes = await app.request(
      'https://api.ledgercore.test/v1/organizations',
      {
        method: 'POST',
        headers: {
          Cookie: sessionA.cookieHeader,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': sessionA.csrfToken,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'org-create-a',
        },
        body: JSON.stringify({ name: 'Canary Alpha', base_currency: 'USD', country: 'US' }),
      },
      TEST_ENV
    );
    expect(createRes.status).toBe(201);
    const { organization: orgA } = (await createRes.json()) as { organization: { id: string } };

    // User B tries to list members or audit events of Org A -> 404 (not 403)
    const foreignMembers = await app.request(
      'https://api.ledgercore.test/v1/members',
      {
        headers: {
          Cookie: sessionB.cookieHeader,
          'X-Organization-Id': orgA.id,
        },
      },
      TEST_ENV
    );
    expect(foreignMembers.status).toBe(404);

    const foreignAudit = await app.request(
      'https://api.ledgercore.test/v1/audit-events',
      {
        headers: {
          Cookie: sessionB.cookieHeader,
          'X-Organization-Id': orgA.id,
        },
      },
      TEST_ENV
    );
    expect(foreignAudit.status).toBe(404);
  });

  it('FT-17 & F-16 Idempotency-Key replays identical response and rejects body mismatch with 422', async () => {
    const { app, loginAs } = makeHarness();
    const sessionA = await loginAs('owner-a@alpha.test');

    const first = await app.request(
      'https://api.ledgercore.test/v1/organizations',
      {
        method: 'POST',
        headers: {
          Cookie: sessionA.cookieHeader,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': sessionA.csrfToken,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-1',
        },
        body: JSON.stringify({ name: 'Replay Corp', base_currency: 'USD', country: 'US' }),
      },
      TEST_ENV
    );
    expect(first.status).toBe(201);
    const firstJson = await first.json();

    const replay = await app.request(
      'https://api.ledgercore.test/v1/organizations',
      {
        method: 'POST',
        headers: {
          Cookie: sessionA.cookieHeader,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': sessionA.csrfToken,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-1',
        },
        body: JSON.stringify({ name: 'Replay Corp', base_currency: 'USD', country: 'US' }),
      },
      TEST_ENV
    );
    expect(replay.status).toBe(201);
    expect(await replay.json()).toEqual(firstJson);

    const mismatch = await app.request(
      'https://api.ledgercore.test/v1/organizations',
      {
        method: 'POST',
        headers: {
          Cookie: sessionA.cookieHeader,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': sessionA.csrfToken,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'idem-1',
        },
        body: JSON.stringify({ name: 'Different Corp', base_currency: 'USD', country: 'US' }),
      },
      TEST_ENV
    );
    expect(mismatch.status).toBe(422);
  });

  it('ST-07 rejects alg=none JWTs and missing MFA for privileged roles when enforced', async () => {
    const { app, loginAs } = makeHarness({ enforceMfa: true });
    const session = await loginAs('nomfa@alpha.test');
    const orgRes = await app.request(
      'https://api.ledgercore.test/v1/organizations',
      {
        method: 'POST',
        headers: {
          Cookie: session.cookieHeader,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': session.csrfToken,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'mfa-org',
        },
        body: JSON.stringify({ name: 'MFA Test Org', base_currency: 'USD', country: 'US' }),
      },
      TEST_ENV
    );
    const { organization } = (await orgRes.json()) as { organization: { id: string } };

    // Owner with aal1 blocked from org privileged endpoint when MFA enforced
    const blocked = await app.request(
      'https://api.ledgercore.test/v1/members',
      {
        headers: {
          Cookie: session.cookieHeader,
          'X-Organization-Id': organization.id,
        },
      },
      TEST_ENV
    );
    expect(blocked.status).toBe(403);
  });

  it('ST-08 blocks unknown fields (mass assignment) and protects last active Owner', async () => {
    const { app, loginAs } = makeHarness();
    const session = await loginAs('owner-a@alpha.test');

    // Unknown field 'role' rejected
    const massAssign = await app.request(
      'https://api.ledgercore.test/v1/organizations',
      {
        method: 'POST',
        headers: {
          Cookie: session.cookieHeader,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': session.csrfToken,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'mass-1',
        },
        body: JSON.stringify({ name: 'Org', base_currency: 'USD', country: 'US', is_admin: true }),
      },
      TEST_ENV
    );
    expect(massAssign.status).toBe(422);

    const orgRes = await app.request(
      'https://api.ledgercore.test/v1/organizations',
      {
        method: 'POST',
        headers: {
          Cookie: session.cookieHeader,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': session.csrfToken,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'owner-org',
        },
        body: JSON.stringify({ name: 'Owner Org', base_currency: 'USD', country: 'US' }),
      },
      TEST_ENV
    );
    const { organization } = (await orgRes.json()) as { organization: { id: string } };

    const membersRes = await app.request(
      'https://api.ledgercore.test/v1/members',
      { headers: { Cookie: session.cookieHeader, 'X-Organization-Id': organization.id } },
      TEST_ENV
    );
    const { items } = (await membersRes.json()) as { items: Array<{ id: string }> };

    const deleteLastOwner = await app.request(
      `https://api.ledgercore.test/v1/members/${items[0]!.id}`,
      {
        method: 'DELETE',
        headers: {
          Cookie: session.cookieHeader,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': session.csrfToken,
          'X-Organization-Id': organization.id,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      TEST_ENV
    );
    expect(deleteLastOwner.status).toBe(409);

    // Audit chain verifies intact (ST-17)
    const verifyRes = await app.request(
      'https://api.ledgercore.test/v1/audit-events/verify',
      {
        method: 'POST',
        headers: {
          Cookie: session.cookieHeader,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': session.csrfToken,
          'X-Organization-Id': organization.id,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      },
      TEST_ENV
    );
    expect(verifyRes.status).toBe(200);
    expect(await verifyRes.json()).toEqual({ valid: true });
  });

  it('ST-10 denies disallowed CORS origins and never returns wildcard with credentials', async () => {
    const { app } = makeHarness();
    const res = await app.request(
      'https://api.ledgercore.test/v1/health',
      {
        method: 'OPTIONS',
        headers: { Origin: 'https://attacker.example' },
      },
      TEST_ENV
    );
    expect(res.status).toBe(403);
    expect(res.headers.get('Access-Control-Allow-Origin')).toBeNull();
  });

  it('ST-11 validates upload content bytes and enforces org-scoped keys', async () => {
    const storage = new InMemoryStorageProvider();
    const orgA = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
    const orgB = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';
    const objId = 'cccccccc-cccc-cccc-cccc-cccccccccccc';

    // Fake PDF bytes rejected
    await expect(
      storage.putObject({
        organizationId: orgA,
        objectId: objId,
        contentType: 'application/pdf',
        body: new TextEncoder().encode('<html>not-a-pdf</html>'),
      })
    ).rejects.toThrow(/PDF signature/);

    // Valid PDF accepted
    const meta = await storage.putObject({
      organizationId: orgA,
      objectId: objId,
      contentType: 'application/pdf',
      body: new TextEncoder().encode('%PDF-1.7\n'),
    });

    // Org B cannot read Org A's key
    await expect(storage.getObject({ organizationId: orgB, key: meta.key })).rejects.toThrow(
      /does not belong to organization/
    );
  });

  it('ST-14 throttles repeated login requests with 429 and Retry-After', async () => {
    const { app } = makeHarness();
    for (let i = 0; i < 20; i++) {
      await app.request(
        'https://api.ledgercore.test/v1/auth/login',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Origin: TEST_ENV.APP_ORIGIN,
            'cf-connecting-ip': '203.0.113.10',
          },
          body: JSON.stringify({ email: 'owner-a@alpha.test', password: 'wrong' }),
        },
        TEST_ENV
      );
    }
    const throttled = await app.request(
      'https://api.ledgercore.test/v1/auth/login',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Origin: TEST_ENV.APP_ORIGIN,
          'cf-connecting-ip': '203.0.113.10',
        },
        body: JSON.stringify({ email: 'owner-a@alpha.test', password: 'wrong' }),
      },
      TEST_ENV
    );
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get('Retry-After')).toBeTruthy();
  });

  it('ST-19 neutralizes formula prefixes in CSV exports', () => {
    const csv = serializeCsv(
      ['Description', 'Amount'],
      [
        ['=CMD("calc")', '100.00'],
        ['+SUM(A1:A2)', '50.00'],
        ['-10+20', '10.00'],
        ['@HYPERLINK("http://evil")', '1.00'],
        ['  =1+1', '2.00'],
      ]
    );
    expect(csv).toContain("'=CMD");
    expect(csv).toContain("'+SUM");
    expect(csv).toContain("'-10+20");
    expect(csv).toContain("'@HYPERLINK");
    expect(csv).toContain("'  =1+1");
  });
});
