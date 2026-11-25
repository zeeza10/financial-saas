import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import type { MemberDto } from '@financial-saas/contracts';
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

describe('Phase 6 Reports & Export Security (ST-05, ST-06, ST-09, ST-14)', () => {
  it('enforces export RBAC (Manager blocked 403, Auditor allowed 200), cross-tenant 404, and export rate limiting', async () => {
    const store = new InMemoryDataStore();
    const ownerId = '11111111-1111-1111-1111-111111111111';
    const managerId = '22222222-2222-2222-2222-222222222222';
    const auditorId = '33333333-3333-3333-3333-333333333333';
    const outsiderId = '44444444-4444-4444-4444-444444444444';

    const users = new Map([
      ['owner@p6sec.test', ownerId],
      ['mgr@p6sec.test', managerId],
      ['aud@p6sec.test', auditorId],
      ['out@p6sec.test', outsiderId],
    ]);

    const authGateway: AuthGateway = {
      async signup() {},
      async loginWithPassword(email) {
        const id = users.get(email)!;
        const token = await new SignJWT({ email, aal: 'aal2' })
          .setProtectedHeader({ alg: 'HS256' })
          .setSubject(id)
          .setAudience('authenticated')
          .setIssuedAt()
          .setExpirationTime('1h')
          .sign(new TextEncoder().encode(TEST_ENV.TEST_JWT_SECRET!));
        return { userId: id, email, accessToken: token, aal: 'aal2' };
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

    const ownerSess = await login('owner@p6sec.test');
    const mgrSess = await login('mgr@p6sec.test');
    const audSess = await login('aud@p6sec.test');
    const outSess = await login('out@p6sec.test');

    const orgRes = await app.request(
      'https://api.ledgercore.test/v1/organizations',
      {
        method: 'POST',
        headers: {
          Cookie: ownerSess.cookie,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': ownerSess.csrf,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'org-p6sec',
        },
        body: JSON.stringify({ name: 'P6 Sec Org', base_currency: 'USD', country: 'US' }),
      },
      TEST_ENV
    );
    const { organization: org } = (await orgRes.json()) as { organization: { id: string } };

    const memMap = (store as unknown as { members: Map<string, MemberDto> }).members;
    memMap.set('mgr-m', {
      id: 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa',
      organization_id: org.id,
      user_id: managerId,
      role: 'manager',
      party_id: null,
      status: 'active',
      created_at: new Date().toISOString(),
    });
    memMap.set('aud-m', {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      organization_id: org.id,
      user_id: auditorId,
      role: 'auditor',
      party_id: null,
      status: 'active',
      created_at: new Date().toISOString(),
    });

    // Outsider gets 404 on dashboard, statements, and export (ST-05/ST-09)
    for (const path of [
      '/v1/dashboard?start_date=2026-01-01&end_date=2026-01-31',
      '/v1/reports/pnl?start_date=2026-01-01&end_date=2026-01-31',
      '/v1/reports/balance-sheet?as_of_date=2026-01-31',
      '/v1/reports/cash-flow?start_date=2026-01-01&end_date=2026-01-31',
      '/v1/reports/export?report=pnl&format=csv&start_date=2026-01-01&end_date=2026-01-31',
    ]) {
      const r = await app.request(
        `https://api.ledgercore.test${path}`,
        { headers: { Cookie: outSess.cookie, 'X-Organization-Id': org.id } },
        TEST_ENV
      );
      expect(r.status).toBe(404);
    }

    // Manager can view scoped dashboard (200) but CANNOT export data (403, USER_ROLES.md)
    const mgrDash = await app.request(
      'https://api.ledgercore.test/v1/dashboard?start_date=2026-01-01&end_date=2026-01-31',
      { headers: { Cookie: mgrSess.cookie, 'X-Organization-Id': org.id } },
      TEST_ENV
    );
    expect(mgrDash.status).toBe(200);

    const mgrExport = await app.request(
      'https://api.ledgercore.test/v1/reports/export?report=pnl&format=csv&start_date=2026-01-01&end_date=2026-01-31',
      { headers: { Cookie: mgrSess.cookie, 'X-Organization-Id': org.id } },
      TEST_ENV
    );
    expect(mgrExport.status).toBe(403);

    // Auditor can export (200) and hits rate limit 429 on 31st request in 1 minute (ST-14)
    for (let i = 0; i < 30; i++) {
      const r = await app.request(
        'https://api.ledgercore.test/v1/reports/export?report=pnl&format=csv&start_date=2026-01-01&end_date=2026-01-31',
        { headers: { Cookie: audSess.cookie, 'X-Organization-Id': org.id } },
        TEST_ENV
      );
      expect(r.status).toBe(200);
    }
    const throttled = await app.request(
      'https://api.ledgercore.test/v1/reports/export?report=pnl&format=csv&start_date=2026-01-01&end_date=2026-01-31',
      { headers: { Cookie: audSess.cookie, 'X-Organization-Id': org.id } },
      TEST_ENV
    );
    expect(throttled.status).toBe(429);
    expect(throttled.headers.get('Retry-After')).toBeTruthy();
  });
});
