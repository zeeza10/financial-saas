import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import type {
  AccountDto,
  AuditEventDto,
  BalanceSheetReportDto,
  CashFlowReportDto,
  DashboardSummaryDto,
  PartyDto,
  SalaryRunDto,
} from '@financial-saas/contracts';
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

async function createPhase6Harness() {
  const store = new InMemoryDataStore();
  const ownerId = '11111111-1111-1111-1111-111111111111';
  const token = await new SignJWT({ email: 'owner@p6.local', aal: 'aal2' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(ownerId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(TEST_ENV.TEST_JWT_SECRET!));

  const authGateway: AuthGateway = {
    async signup() {},
    async loginWithPassword() {
      return { userId: ownerId, email: 'owner@p6.local', accessToken: token, aal: 'aal2' };
    },
  };

  const app = createApiApp({
    getEnv: () => TEST_ENV,
    createStore: () => store,
    createAuthGateway: () => authGateway,
    rateLimiter: new InMemoryRateLimiter(),
  });

  const loginRes = await app.request(
    'https://api.ledgercore.test/v1/auth/login',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Origin: TEST_ENV.APP_ORIGIN },
      body: JSON.stringify({ email: 'owner@p6.local', password: 'ValidStrongPassword123!' }),
    },
    TEST_ENV
  );
  const cookie = loginRes.headers.getSetCookie().map((c) => c.split(';')[0]!).join('; ');
  const { csrf_token: csrf } = (await loginRes.json()) as { csrf_token: string };

  async function api<T>(
    method: string,
    path: string,
    options?: { orgId?: string; body?: unknown; idem?: string }
  ): Promise<{ status: number; data: T }> {
    const headers: Record<string, string> = {
      Cookie: cookie,
      Origin: TEST_ENV.APP_ORIGIN,
    };
    if (options?.orgId) headers['X-Organization-Id'] = options.orgId;
    if (method !== 'GET') {
      headers['Content-Type'] = 'application/json';
      headers['X-CSRF-Token'] = csrf;
    }
    if (options?.idem) headers['Idempotency-Key'] = options.idem;

    const res = await app.request(
      `https://api.ledgercore.test${path}`,
      {
        method,
        headers,
        body: options?.body !== undefined ? JSON.stringify(options.body) : undefined,
      },
      TEST_ENV
    );
    return { status: res.status, data: (await res.json()) as T };
  }

  async function rawGet(path: string, orgId: string) {
    return app.request(
      `https://api.ledgercore.test${path}`,
      { headers: { Cookie: cookie, 'X-Organization-Id': orgId } },
      TEST_ENV
    );
  }

  const orgId = (
    await api<{ organization: { id: string } }>('POST', '/v1/organizations', {
      body: { name: 'Dashboard Corp', base_currency: 'USD', country: 'US' },
      idem: 'org-p6',
    })
  ).data.organization.id;

  const accounts = (
    await api<{ items: AccountDto[] }>('POST', '/v1/accounts/seed-template', {
      orgId,
      body: {},
      idem: 'seed-p6',
    })
  ).data.items;
  const byCode = (c: string) => accounts.find((a) => a.code === c)!;

  return { api, rawGet, orgId, byCode };
}

describe('Phase 6 Financial Dashboard, Statements & Exports (FT-11, FT-18, FT-19, FT-29, ST-19)', () => {
  it('computes live Dashboard KPIs, balanced Balance Sheet, reconciled Cash Flow, and excludes personal accounts', async () => {
    const { api, rawGet, orgId, byCode } = await createPhase6Harness();
    const bank = byCode('1000');
    const cash = byCode('1010');
    const personalBank = byCode('1900');
    const salPay = byCode('2100');
    const invCap = byCode('3000');
    const draws = byCode('3200');
    const sales = byCode('4000');
    const cogs = byCode('5000');
    const mktFees = byCode('5100');
    const shipExp = byCode('5200');
    const bankFees = byCode('5300');
    const subs = byCode('5400');
    const salExp = byCode('5500');

    const invParty = (
      await api<{ party: PartyDto }>('POST', '/v1/parties', {
        orgId,
        idem: 'p6-inv',
        body: { party_type: 'investor', display_name: 'Investor Prime' },
      })
    ).data.party;
    const empParty = (
      await api<{ party: PartyDto }>('POST', '/v1/parties', {
        orgId,
        idem: 'p6-emp',
        body: { party_type: 'employee', display_name: 'Emp One' },
      })
    ).data.party;

    // 1. Investor capital $5,000
    await api('POST', '/v1/investors/contributions', {
      orgId,
      idem: 'p6-cap',
      body: {
        party_id: invParty.id,
        treatment: 'equity',
        contribution_date: '2026-01-05',
        gross_amount_minor: '500000',
        wire_fee_minor: '0',
        currency: 'USD',
        bank_account_id: bank.id,
        capital_or_loan_account_id: invCap.id,
      },
    });

    // 2. eBay sales $10,000, fees $1,300, settled to bank ($8,700)
    await api('POST', '/v1/ebay/payouts', {
      orgId,
      idem: 'p6-ebay',
      body: {
        payout_date: '2026-01-10',
        payout_ref: 'EBAY-P6-1',
        gross_sales_minor: '1000000',
        marketplace_fees_minor: '130000',
        currency: 'USD',
        clearing_account_id: byCode('1050').id,
        sales_account_id: sales.id,
        fees_account_id: mktFees.id,
        bank_account_id: bank.id,
      },
    });

    // 3. COGS $4,000, Shipping $600, Subscriptions $100 (and test T-19 formula string in account name)
    for (const [idx, [accId, amt, desc]] of [
      [cogs.id, '400000', 'COGS'],
      [shipExp.id, '60000', 'Shipping'],
      [subs.id, '10000', '=SUM(A1:A2) Subscription'],
    ].entries()) {
      await api('POST', '/v1/expenses', {
        orgId,
        idem: `p6-exp-${idx}`,
        body: {
          expense_date: '2026-01-12',
          description: desc,
          amount_minor: amt,
          currency: 'USD',
          owner_scope: 'company',
          paid_from: 'business_bank',
          expense_account_id: accId,
          payment_account_id: bank.id,
        },
      });
    }

    // 4. Transfer $2,000 with $10 wire fee
    await api('POST', '/v1/transfers', {
      orgId,
      idem: 'p6-xfer',
      body: {
        from_account_id: bank.id,
        to_account_id: cash.id,
        amount_minor: '200000',
        fee_amount_minor: '1000',
        fee_account_id: bankFees.id,
        currency: 'USD',
        transfer_date: '2026-01-15',
      },
    });

    // 5. Personal draw $300 + Personal bank deposit $3,000
    await api('POST', '/v1/expenses', {
      orgId,
      idem: 'p6-draw',
      body: {
        expense_date: '2026-01-16',
        description: 'Personal draw',
        amount_minor: '30000',
        currency: 'USD',
        owner_scope: 'personal',
        paid_from: 'business_bank',
        expense_account_id: draws.id,
        payment_account_id: bank.id,
      },
    });

    const persDraft = await api<{ entry: { id: string } }>('POST', '/v1/journal-entries', {
      orgId,
      idem: 'p6-pers-draft',
      body: {
        entry_date: '2026-01-17',
        description: 'Personal account only',
        lines: [
          { account_id: personalBank.id, side: 'debit', amount_minor: '300000', currency: 'USD' },
          { account_id: byCode('3900').id, side: 'credit', amount_minor: '300000', currency: 'USD' },
        ],
      },
    });
    await api('POST', `/v1/journal-entries/${persDraft.data.entry.id}/post`, {
      orgId,
      body: {},
      idem: 'p6-pers-post',
    });

    // 6. Salary $1,500 accrued & paid
    const run = (
      await api<{ salary_run: SalaryRunDto }>('POST', '/v1/salary-runs', {
        orgId,
        idem: 'p6-sal-acc',
        body: {
          party_id: empParty.id,
          accrual_date: '2026-01-25',
          amount_minor: '150000',
          currency: 'USD',
          salary_expense_account_id: salExp.id,
          salaries_payable_account_id: salPay.id,
        },
      })
    ).data.salary_run;
    await api('POST', `/v1/salary-runs/${run.id}/pay`, {
      orgId,
      idem: 'p6-sal-pay',
      body: {
        payment_date: '2026-01-28',
        bank_account_id: bank.id,
        salaries_payable_account_id: salPay.id,
      },
    });

    // Verify Dashboard KPIs
    const dashRes = await api<{ summary: DashboardSummaryDto }>(
      'GET',
      '/v1/dashboard?start_date=2026-01-01&end_date=2026-01-31',
      { orgId }
    );
    expect(dashRes.status).toBe(200);
    const { kpis, monthly_series, yearly_series } = dashRes.data.summary;
    expect(kpis.total_income_minor).toBe('1000000'); // $10,000.00
    expect(kpis.total_expenses_minor).toBe('751000'); // $7,510.00
    expect(kpis.net_profit_minor).toBe('249000'); // $2,490.00 (FT-18)
    expect(kpis.total_investments_minor).toBe('500000'); // $5,000.00
    expect(kpis.personal_accounts_balance_minor).toBe('300000'); // $3,000.00 separate
    // Bank + Cash = 5000 + 8700 - 4700 - 10 - 300 - 1500 = 7190.00 (719000 minor)
    const totalLiquid = BigInt(kpis.bank_balance_minor) + BigInt(kpis.cash_balance_minor);
    expect(totalLiquid).toBe(719000n);
    expect(monthly_series).toHaveLength(1);
    expect(monthly_series[0]!.month).toBe('2026-01');
    expect(yearly_series).toHaveLength(1);
    expect(yearly_series[0]!.year).toBe('2026');

    // Verify Balance Sheet (Assets = Liabilities + Equity, FT-19)
    const bsRes = await api<{ report: BalanceSheetReportDto }>(
      'GET',
      '/v1/reports/balance-sheet?as_of_date=2026-01-31',
      { orgId }
    );
    expect(bsRes.data.report.is_balanced).toBe(true);
    expect(bsRes.data.report.total_assets_minor).toBe('719000');
    expect(bsRes.data.report.current_net_income_minor).toBe('249000');

    // Verify Cash Flow Statement
    const cfRes = await api<{ report: CashFlowReportDto }>(
      'GET',
      '/v1/reports/cash-flow?start_date=2026-01-01&end_date=2026-01-31',
      { orgId }
    );
    expect(cfRes.data.report.is_reconciled).toBe(true);
    expect(cfRes.data.report.operating_minor).toBe('249000');
    expect(cfRes.data.report.financing_minor).toBe('470000'); // +5000 capital - 300 draw
    expect(cfRes.data.report.closing_cash_minor).toBe('719000');

    // Verify CSV, XLSX, and PDF exports + audit trail (BR-021, FT-29)
    const csvRes = await rawGet(
      '/v1/reports/export?report=pnl&format=csv&start_date=2026-01-01&end_date=2026-01-31',
      orgId
    );
    expect(csvRes.status).toBe(200);
    expect(csvRes.headers.get('content-type')).toContain('text/csv');
    const csvBody = await csvRes.text();
    expect(csvBody).toContain('2490.00');

    const xlsxRes = await rawGet(
      '/v1/reports/export?report=balance-sheet&format=xlsx&start_date=2026-01-01&end_date=2026-01-31',
      orgId
    );
    expect(xlsxRes.status).toBe(200);
    const xlsxBytes = new Uint8Array(await xlsxRes.arrayBuffer());
    expect(xlsxBytes[0]).toBe(0x50); // 'P'
    expect(xlsxBytes[1]).toBe(0x4b); // 'K'

    const pdfRes = await rawGet(
      '/v1/reports/export?report=cash-flow&format=pdf&start_date=2026-01-01&end_date=2026-01-31',
      orgId
    );
    expect(pdfRes.status).toBe(200);
    const pdfText = await pdfRes.text();
    expect(pdfText.startsWith('%PDF-1.4')).toBe(true);
    expect(pdfText.trimEnd().endsWith('%%EOF')).toBe(true);

    // Confirm all 3 exports were audited
    const auditRes = await api<{ items: AuditEventDto[] }>('GET', '/v1/audit-events', { orgId });
    const exportAudits = auditRes.data.items.filter((e) => e.action === 'report.exported');
    expect(exportAudits).toHaveLength(3);
  });
});
