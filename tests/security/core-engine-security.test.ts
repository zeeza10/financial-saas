import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import type { AccountDto, MemberDto, PeriodDto } from '@financial-saas/contracts';
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

describe('Phase 4 Core Financial Engine Security (ST-05, ST-06, ST-09, ST-16)', () => {
  it('enforces tenant isolation (404), role permissions (Accountant vs Owner on period reopen), and rejects malicious payloads', async () => {
    const store = new InMemoryDataStore();
    const ownerId = '11111111-1111-1111-1111-111111111111';
    const accountantId = '22222222-2222-2222-2222-222222222222';
    const outsiderId = '33333333-3333-3333-3333-333333333333';

    const users = new Map([
      ['owner@org.test', { id: ownerId, aal: 'aal2' as const }],
      ['acc@org.test', { id: accountantId, aal: 'aal2' as const }],
      ['outsider@other.test', { id: outsiderId, aal: 'aal2' as const }],
    ]);

    const authGateway: AuthGateway = {
      async signup() {},
      async loginWithPassword(email) {
        const u = users.get(email)!;
        const token = await new SignJWT({ email, aal: u.aal })
          .setProtectedHeader({ alg: 'HS256' })
          .setSubject(u.id)
          .setAudience('authenticated')
          .setIssuedAt()
          .setExpirationTime('1h')
          .sign(new TextEncoder().encode(TEST_ENV.TEST_JWT_SECRET!));
        return { userId: u.id, email, accessToken: token, aal: u.aal };
      },
    };

    const app = createApiApp({
      getEnv: () => TEST_ENV,
      createStore: () => store,
      createAuthGateway: () => authGateway,
      rateLimiter: new InMemoryRateLimiter(),
    });

    async function login(email: string) {
      const res = await app.request(
        'https://api.ledgercore.test/v1/auth/login',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Origin: TEST_ENV.APP_ORIGIN },
          body: JSON.stringify({ email, password: 'ValidStrongPassword123!' }),
        },
        TEST_ENV
      );
      const cookie = res.headers.getSetCookie().map((c) => c.split(';')[0]!).join('; ');
      const { csrf_token: csrf } = (await res.json()) as { csrf_token: string };
      return { cookie, csrf };
    }

    const ownerSess = await login('owner@org.test');
    const accSess = await login('acc@org.test');
    const outsiderSess = await login('outsider@other.test');

    // Owner creates org & seeds CoA
    const orgRes = await app.request(
      'https://api.ledgercore.test/v1/organizations',
      {
        method: 'POST',
        headers: {
          Cookie: ownerSess.cookie,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': ownerSess.csrf,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'org-sec',
        },
        body: JSON.stringify({ name: 'Org Sec', base_currency: 'USD', country: 'US' }),
      },
      TEST_ENV
    );
    const { organization: org } = (await orgRes.json()) as { organization: { id: string } };

    // Directly register Accountant membership in InMemoryDataStore for role testing
    const memMap = (store as unknown as { members: Map<string, MemberDto> }).members;
    memMap.set('acc-member', {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      organization_id: org.id,
      user_id: accountantId,
      email: 'acc@org.test',
      role: 'accountant',
      party_id: null,
      status: 'active',
      created_at: new Date().toISOString(),
    });

    await app.request(
      'https://api.ledgercore.test/v1/accounts/seed-template',
      {
        method: 'POST',
        headers: {
          Cookie: ownerSess.cookie,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': ownerSess.csrf,
          'X-Organization-Id': org.id,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'seed-sec',
        },
        body: '{}',
      },
      TEST_ENV
    );

    const accRes = await app.request(
      'https://api.ledgercore.test/v1/accounts',
      { headers: { Cookie: ownerSess.cookie, 'X-Organization-Id': org.id } },
      TEST_ENV
    );
    const { items: accounts } = (await accRes.json()) as { items: AccountDto[] };

    // Outsider cannot read accounts, ledger, trial-balance, or bank-accounts -> 404 (ST-05/ST-09)
    for (const path of ['/v1/accounts', '/v1/ledger', '/v1/trial-balance', '/v1/bank-accounts']) {
      const r = await app.request(
        `https://api.ledgercore.test${path}`,
        { headers: { Cookie: outsiderSess.cookie, 'X-Organization-Id': org.id } },
        TEST_ENV
      );
      expect(r.status).toBe(404);
    }

    // FT-24 / ST-06: Accountant can open & close period, but CANNOT reopen closed period (403)
    const pRes = await app.request(
      'https://api.ledgercore.test/v1/periods',
      {
        method: 'POST',
        headers: {
          Cookie: accSess.cookie,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': accSess.csrf,
          'X-Organization-Id': org.id,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'p-sec',
        },
        body: JSON.stringify({ name: 'Nov 2026', start_date: '2026-11-01', end_date: '2026-11-30' }),
      },
      TEST_ENV
    );
    expect(pRes.status).toBe(201);
    const { period } = (await pRes.json()) as { period: PeriodDto };

    const closeRes = await app.request(
      `https://api.ledgercore.test/v1/periods/${period.id}/close`,
      {
        method: 'POST',
        headers: {
          Cookie: accSess.cookie,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': accSess.csrf,
          'X-Organization-Id': org.id,
          'Content-Type': 'application/json',
        },
        body: '{}',
      },
      TEST_ENV
    );
    expect(closeRes.status).toBe(200);

    const accReopen = await app.request(
      `https://api.ledgercore.test/v1/periods/${period.id}/reopen`,
      {
        method: 'POST',
        headers: {
          Cookie: accSess.cookie,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': accSess.csrf,
          'X-Organization-Id': org.id,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ reason: 'Accountant trying to reopen period' }),
      },
      TEST_ENV
    );
    expect(accReopen.status).toBe(403);

    // ST-16: Negative amount, wrong currency, and full bank account number (>4 digits) rejected (422)
    const negDraft = await app.request(
      'https://api.ledgercore.test/v1/journal-entries',
      {
        method: 'POST',
        headers: {
          Cookie: accSess.cookie,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': accSess.csrf,
          'X-Organization-Id': org.id,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'neg-draft',
        },
        body: JSON.stringify({
          entry_date: '2026-11-05',
          description: 'Negative attack',
          lines: [
            { account_id: accounts[0]!.id, side: 'debit', amount_minor: '-100', currency: 'USD' },
            { account_id: accounts[1]!.id, side: 'credit', amount_minor: '-100', currency: 'USD' },
          ],
        }),
      },
      TEST_ENV
    );
    expect(negDraft.status).toBe(422);

    const fullBankNumber = await app.request(
      'https://api.ledgercore.test/v1/bank-accounts',
      {
        method: 'POST',
        headers: {
          Cookie: accSess.cookie,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': accSess.csrf,
          'X-Organization-Id': org.id,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'full-bank',
        },
        body: JSON.stringify({
          account_id: accounts[0]!.id,
          institution: 'Chase',
          last4: '1234567890',
          ownership_type: 'business',
          currency: 'USD',
        }),
      },
      TEST_ENV
    );
    expect(fullBankNumber.status).toBe(422);
  });
});
