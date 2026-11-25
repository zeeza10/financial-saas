import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import type { AccountDto, MemberDto, PartyDto, PeriodDto } from '@financial-saas/contracts';
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

describe('Phase 5 Business Modules Security (F9, ST-05, ST-06, ST-09, ST-16)', () => {
  it('enforces Investor self-service party isolation (404 on other party), rejects invalid profit agreements, and blocks open-period distributions', async () => {
    const store = new InMemoryDataStore();
    const ownerId = '11111111-1111-1111-1111-111111111111';
    const investorUserId = '22222222-2222-2222-2222-222222222222';
    const outsiderId = '33333333-3333-3333-3333-333333333333';

    const users = new Map([
      ['owner@p5sec.test', ownerId],
      ['inv@p5sec.test', investorUserId],
      ['out@p5sec.test', outsiderId],
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

    const ownerSess = await login('owner@p5sec.test');
    const invSess = await login('inv@p5sec.test');
    const outsiderSess = await login('out@p5sec.test');

    const orgRes = await app.request(
      'https://api.ledgercore.test/v1/organizations',
      {
        method: 'POST',
        headers: {
          Cookie: ownerSess.cookie,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': ownerSess.csrf,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'org-p5sec',
        },
        body: JSON.stringify({ name: 'Org P5 Sec', base_currency: 'USD', country: 'US' }),
      },
      TEST_ENV
    );
    const { organization: org } = (await orgRes.json()) as { organization: { id: string } };

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
          'Idempotency-Key': 'seed-p5sec',
        },
        body: '{}',
      },
      TEST_ENV
    );

    const accList = (
      await (
        await app.request(
          'https://api.ledgercore.test/v1/accounts',
          { headers: { Cookie: ownerSess.cookie, 'X-Organization-Id': org.id } },
          TEST_ENV
        )
      ).json()
    ) as { items: AccountDto[] };
    const byCode = (c: string) => accList.items.find((a) => a.code === c)!;

    // Create two parties: Investor A (linked to investorUserId) and Investor B
    const partyA = (
      (await (
        await app.request(
          'https://api.ledgercore.test/v1/parties',
          {
            method: 'POST',
            headers: {
              Cookie: ownerSess.cookie,
              Origin: TEST_ENV.APP_ORIGIN,
              'X-CSRF-Token': ownerSess.csrf,
              'X-Organization-Id': org.id,
              'Content-Type': 'application/json',
              'Idempotency-Key': 'pa',
            },
            body: JSON.stringify({ party_type: 'investor', display_name: 'Investor A' }),
          },
          TEST_ENV
        )
      ).json()) as { party: PartyDto }
    ).party;

    const partyB = (
      (await (
        await app.request(
          'https://api.ledgercore.test/v1/parties',
          {
            method: 'POST',
            headers: {
              Cookie: ownerSess.cookie,
              Origin: TEST_ENV.APP_ORIGIN,
              'X-CSRF-Token': ownerSess.csrf,
              'X-Organization-Id': org.id,
              'Content-Type': 'application/json',
              'Idempotency-Key': 'pb',
            },
            body: JSON.stringify({ party_type: 'investor', display_name: 'Investor B' }),
          },
          TEST_ENV
        )
      ).json()) as { party: PartyDto }
    ).party;

    // Link investorUserId -> partyA as 'investor'
    const memMap = (store as unknown as { members: Map<string, MemberDto> }).members;
    memMap.set('inv-member', {
      id: 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb',
      organization_id: org.id,
      user_id: investorUserId,
      email: 'inv@p5sec.test',
      role: 'investor',
      party_id: partyA.id,
      status: 'active',
      created_at: new Date().toISOString(),
    });

    // F9 / ST-05: Investor A cannot read Investor B's ledger -> 404
    const foreignParty = await app.request(
      `https://api.ledgercore.test/v1/parties/${partyB.id}/ledger`,
      { headers: { Cookie: invSess.cookie, 'X-Organization-Id': org.id } },
      TEST_ENV
    );
    expect(foreignParty.status).toBe(404);

    // Investor A cannot run distribution or create parties -> 403
    const invCreateParty = await app.request(
      'https://api.ledgercore.test/v1/parties',
      {
        method: 'POST',
        headers: {
          Cookie: invSess.cookie,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': invSess.csrf,
          'X-Organization-Id': org.id,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'inv-p',
        },
        body: JSON.stringify({ party_type: 'investor', display_name: 'Fake' }),
      },
      TEST_ENV
    );
    expect(invCreateParty.status).toBe(403);

    // ST-09: Outsider gets 404 across Phase 5 endpoints
    for (const path of ['/v1/parties', '/v1/invoices-bills', '/v1/profit-sharing/agreements', '/v1/assets']) {
      const r = await app.request(
        `https://api.ledgercore.test${path}`,
        { headers: { Cookie: outsiderSess.cookie, 'X-Organization-Id': org.id } },
        TEST_ENV
      );
      expect(r.status).toBe(404);
    }

    // FT-13: Agreement percentages summing to 99% rejected (422)
    const badAgr = await app.request(
      'https://api.ledgercore.test/v1/profit-sharing/agreements',
      {
        method: 'POST',
        headers: {
          Cookie: ownerSess.cookie,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': ownerSess.csrf,
          'X-Organization-Id': org.id,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'bad-agr',
        },
        body: JSON.stringify({
          name: 'Invalid 99%',
          effective_from: '2026-01-01',
          lines: [
            { party_id: partyA.id, share_bps: 6000 },
            { party_id: partyB.id, share_bps: 3900 },
          ],
        }),
      },
      TEST_ENV
    );
    expect(badAgr.status).toBe(422);

    // BR-009: Personal expense paid from business bank attempting to debit Company Expense rejected (422)
    const badPersonalExp = await app.request(
      'https://api.ledgercore.test/v1/expenses',
      {
        method: 'POST',
        headers: {
          Cookie: ownerSess.cookie,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': ownerSess.csrf,
          'X-Organization-Id': org.id,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'bad-pers',
        },
        body: JSON.stringify({
          expense_date: '2026-11-10',
          description: 'Disguised personal expense',
          amount_minor: '8000',
          currency: 'USD',
          owner_scope: 'personal',
          paid_from: 'business_bank',
          expense_account_id: byCode('5400').id,
          payment_account_id: byCode('1000').id,
        }),
      },
      TEST_ENV
    );
    expect(badPersonalExp.status).toBe(422);

    // BR-011: Distribution on OPEN period rejected (422)
    const openPeriod = (
      (await (
        await app.request(
          'https://api.ledgercore.test/v1/periods',
          {
            method: 'POST',
            headers: {
              Cookie: ownerSess.cookie,
              Origin: TEST_ENV.APP_ORIGIN,
              'X-CSRF-Token': ownerSess.csrf,
              'X-Organization-Id': org.id,
              'Content-Type': 'application/json',
              'Idempotency-Key': 'open-p',
            },
            body: JSON.stringify({ name: 'Open Dec', start_date: '2026-12-01', end_date: '2026-12-31' }),
          },
          TEST_ENV
        )
      ).json()) as { period: PeriodDto }
    ).period;

    const openDist = await app.request(
      'https://api.ledgercore.test/v1/profit-sharing/distributions',
      {
        method: 'POST',
        headers: {
          Cookie: ownerSess.cookie,
          Origin: TEST_ENV.APP_ORIGIN,
          'X-CSRF-Token': ownerSess.csrf,
          'X-Organization-Id': org.id,
          'Content-Type': 'application/json',
          'Idempotency-Key': 'open-dist',
        },
        body: JSON.stringify({
          period_id: openPeriod.id,
          distribution_date: '2026-12-31',
          retained_earnings_account_id: byCode('3100').id,
          due_to_partner_account_id: byCode('2300').id,
        }),
      },
      TEST_ENV
    );
    expect(openDist.status).toBe(422);
  });
});
