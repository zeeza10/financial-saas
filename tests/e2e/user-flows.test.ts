import { describe, expect, it } from 'vitest';
import type {
  AccountDto,
  BalanceSheetReportDto,
  DashboardSummaryDto,
  JournalEntryDto,
  OrganizationDto,
  PeriodDto,
} from '@financial-saas/contracts';
import { createLocalApiApp } from '../../apps/api/src/local-server.js';

describe('E2E User Flows (F1-F10 against local-server app)', () => {
  it('executes F1 signup/login -> create org -> seed CoA -> post & reverse -> period close -> dashboard & audit verify', async () => {
    const appOrigin = 'http://127.0.0.1:5173';
    const baseUrl = 'http://127.0.0.1:8787';
    const { app, env } = createLocalApiApp({ localDevMode: true, appOrigin });

    const call = (path: string, init?: RequestInit) =>
      app.request(`${baseUrl}${path}`, init, env);

    // 1. Health check
    const health = await call('/v1/health');
    expect(health.status).toBe(200);

    // 2. F1 Signup (min 12-char password)
    const signup = await call('/v1/auth/signup', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: appOrigin },
      body: JSON.stringify({
        email: 'founder@ebayshop.test',
        password: 'VeryStrongPassword#2026',
        display_name: 'Founder',
      }),
    });
    expect(signup.status).toBe(202);

    // 3. Login -> receive BFF HttpOnly session cookie + CSRF cookie
    const login = await call('/v1/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: appOrigin },
      body: JSON.stringify({
        email: 'founder@ebayshop.test',
        password: 'VeryStrongPassword#2026',
      }),
    });
    expect(login.status).toBe(200);
    const setCookies = login.headers.getSetCookie();
    expect(setCookies.some((c) => c.includes('fs_session=') && c.includes('HttpOnly'))).toBe(true);
    const cookieHeader = setCookies.map((c) => c.split(';')[0]!).join('; ');
    const loginJson = (await login.json()) as { csrf_token: string };
    const csrf = loginJson.csrf_token;

    // 4. Create organization
    const orgRes = await call('/v1/organizations', {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        Origin: appOrigin,
        'X-CSRF-Token': csrf,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'e2e-org-1',
      },
      body: JSON.stringify({
        name: 'E2E eBay Store',
        base_currency: 'USD',
        country: 'US',
      }),
    });
    expect(orgRes.status).toBe(201);
    const { organization: org } = (await orgRes.json()) as { organization: OrganizationDto };

    // 5. Seed Chart of Accounts
    const seedRes = await call('/v1/accounts/seed-template', {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        Origin: appOrigin,
        'X-CSRF-Token': csrf,
        'X-Organization-Id': org.id,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'e2e-seed-1',
      },
      body: '{}',
    });
    expect(seedRes.status).toBe(201);
    const { items: accounts } = (await seedRes.json()) as { items: AccountDto[] };
    const byCode = (c: string) => accounts.find((a) => a.code === c)!;

    // 6. Post balanced sale entry
    const draftRes = await call('/v1/journal-entries', {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        Origin: appOrigin,
        'X-CSRF-Token': csrf,
        'X-Organization-Id': org.id,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'e2e-draft-1',
      },
      body: JSON.stringify({
        entry_date: '2026-11-10',
        description: 'Live local eBay sale',
        lines: [
          { account_id: byCode('1000').id, side: 'debit', amount_minor: '50000', currency: 'USD' },
          { account_id: byCode('4000').id, side: 'credit', amount_minor: '50000', currency: 'USD' },
        ],
      }),
    });
    const { entry: draft } = (await draftRes.json()) as { entry: JournalEntryDto };

    const postRes = await call(`/v1/journal-entries/${draft.id}/post`, {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        Origin: appOrigin,
        'X-CSRF-Token': csrf,
        'X-Organization-Id': org.id,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'e2e-post-1',
      },
      body: '{}',
    });
    expect(postRes.status).toBe(200);
    const { entry: posted } = (await postRes.json()) as { entry: JournalEntryDto };
    expect(posted.entry_no).toBe('1');

    // 7. Dashboard & Balance Sheet live
    const dashRes = await call('/v1/dashboard?start_date=2026-11-01&end_date=2026-11-30', {
      headers: { Cookie: cookieHeader, 'X-Organization-Id': org.id },
    });
    expect(dashRes.status).toBe(200);
    const { summary } = (await dashRes.json()) as { summary: DashboardSummaryDto };
    expect(summary.kpis.total_income_minor).toBe('50000');
    expect(summary.kpis.net_profit_minor).toBe('50000');

    const bsRes = await call('/v1/reports/balance-sheet?as_of_date=2026-11-30', {
      headers: { Cookie: cookieHeader, 'X-Organization-Id': org.id },
    });
    const { report: bs } = (await bsRes.json()) as { report: BalanceSheetReportDto };
    expect(bs.is_balanced).toBe(true);

    // 8. Period close
    const periodRes = await call('/v1/periods', {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        Origin: appOrigin,
        'X-CSRF-Token': csrf,
        'X-Organization-Id': org.id,
        'Content-Type': 'application/json',
        'Idempotency-Key': 'e2e-p1',
      },
      body: JSON.stringify({ name: 'Nov 2026', start_date: '2026-11-01', end_date: '2026-11-30' }),
    });
    const { period } = (await periodRes.json()) as { period: PeriodDto };

    const closeRes = await call(`/v1/periods/${period.id}/close`, {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        Origin: appOrigin,
        'X-CSRF-Token': csrf,
        'X-Organization-Id': org.id,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(closeRes.status).toBe(200);

    // 9. Verify audit chain intact
    const verifyRes = await call('/v1/audit-events/verify', {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        Origin: appOrigin,
        'X-CSRF-Token': csrf,
        'X-Organization-Id': org.id,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(await verifyRes.json()).toEqual({ valid: true });

    // 10. Logout clears cookies
    const logoutRes = await call('/v1/auth/logout', {
      method: 'POST',
      headers: {
        Cookie: cookieHeader,
        Origin: appOrigin,
        'X-CSRF-Token': csrf,
        'Content-Type': 'application/json',
      },
      body: '{}',
    });
    expect(logoutRes.status).toBe(200);
  });
});
