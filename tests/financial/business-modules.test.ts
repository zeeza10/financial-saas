import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import type {
  AccountDto,
  AssetDto,
  IndividualLedgerDto,
  InvoiceBillDto,
  PartyDto,
  PeriodDto,
  ProfitDistributionDto,
  SalaryRunDto,
  TrialBalanceReportDto,
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

async function createPhase5Harness() {
  const store = new InMemoryDataStore();
  const ownerId = '11111111-1111-1111-1111-111111111111';
  const token = await new SignJWT({ email: 'owner@p5.local', aal: 'aal2' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(ownerId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(TEST_ENV.TEST_JWT_SECRET!));

  const authGateway: AuthGateway = {
    async signup() {},
    async loginWithPassword() {
      return { userId: ownerId, email: 'owner@p5.local', accessToken: token, aal: 'aal2' };
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
      body: JSON.stringify({ email: 'owner@p5.local', password: 'ValidStrongPassword123!' }),
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
    const data = (await res.json()) as T;
    return { status: res.status, data };
  }

  const orgRes = await api<{ organization: { id: string } }>('POST', '/v1/organizations', {
    body: { name: 'Golden Scenario LLC', base_currency: 'USD', country: 'US' },
    idem: 'org-p5',
  });
  const orgId = orgRes.data.organization.id;

  const seedRes = await api<{ items: AccountDto[] }>('POST', '/v1/accounts/seed-template', {
    orgId,
    body: {},
    idem: 'seed-p5',
  });
  const byCode = (c: string) => seedRes.data.items.find((a) => a.code === c)!;

  return { api, orgId, byCode };
}

describe('Phase 5 Business Modules Financial Rules (FT-08..FT-35)', () => {
  it('FT-08, FT-09, FT-12, FT-18, FT-26, FT-34: Golden Scenario net profit 2,490.00, salary accrual/pay, shareholding vs profit share, and versioned distributions', async () => {
    const { api, orgId, byCode } = await createPhase5Harness();
    const bank = byCode('1000');
    const cash = byCode('1010');
    const salPay = byCode('2100');
    const duePartner = byCode('2300');
    const invCap = byCode('3000');
    const retEarn = byCode('3100');
    const draws = byCode('3200');
    const sales = byCode('4000');
    const cogs = byCode('5000');
    const mktFees = byCode('5100');
    const shipExp = byCode('5200');
    const bankFees = byCode('5300');
    const subs = byCode('5400');
    const salExp = byCode('5500');

    // Parties: Investor holds 70% shareholding (7000 bps) but only 50% profit share (FT-34)
    const invParty = (
      await api<{ party: PartyDto }>('POST', '/v1/parties', {
        orgId,
        idem: 'p-inv',
        body: { party_type: 'investor', display_name: 'Investor One', shareholding_bps: 7000 },
      })
    ).data.party;
    const ownerParty = (
      await api<{ party: PartyDto }>('POST', '/v1/parties', {
        orgId,
        idem: 'p-own',
        body: { party_type: 'owner', display_name: 'Operating Partner', shareholding_bps: 3000 },
      })
    ).data.party;
    const empParty = (
      await api<{ party: PartyDto }>('POST', '/v1/parties', {
        orgId,
        idem: 'p-emp',
        body: { party_type: 'employee', display_name: 'Warehouse Staff' },
      })
    ).data.party;

    // Open Jan 2026 period
    const janPeriod = (
      await api<{ period: PeriodDto }>('POST', '/v1/periods', {
        orgId,
        idem: 'p-jan',
        body: { name: 'Jan 2026', start_date: '2026-01-01', end_date: '2026-01-31' },
      })
    ).data.period;

    // FT-08: Investor contributes 5,000.00 (Equity, excluded from P&L)
    const contrib = await api('POST', '/v1/investors/contributions', {
      orgId,
      idem: 'contrib-1',
      body: {
        party_id: invParty.id,
        treatment: 'equity',
        contribution_date: '2026-01-02',
        gross_amount_minor: '500000',
        wire_fee_minor: '0',
        currency: 'USD',
        bank_account_id: bank.id,
        capital_or_loan_account_id: invCap.id,
      },
    });
    expect(contrib.status).toBe(201);

    // FT-18 Sales 10,000 + Marketplace Fees 1,300 (net 8,700) via eBay Payout
    await api('POST', '/v1/ebay/payouts', {
      orgId,
      idem: 'ebay-jan',
      body: {
        payout_date: '2026-01-10',
        payout_ref: 'EBAY-JAN-1',
        gross_sales_minor: '1000000',
        marketplace_fees_minor: '130000',
        currency: 'USD',
        clearing_account_id: byCode('1050').id,
        sales_account_id: sales.id,
        fees_account_id: mktFees.id,
        bank_account_id: bank.id,
      },
    });

    // COGS 4,000, Shipping 600, Subscriptions 100
    for (const [idx, [accId, amt, desc]] of [
      [cogs.id, '400000', 'Product COGS'],
      [shipExp.id, '60000', 'Shipping labels'],
      [subs.id, '10000', 'Software subscription'],
    ].entries()) {
      await api('POST', '/v1/expenses', {
        orgId,
        idem: `exp-${idx}`,
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

    // Transfer 2,000 with 10 bank fee (transfer itself does not change profit; fee = 10)
    await api('POST', '/v1/transfers', {
      orgId,
      idem: 'xfer-jan',
      body: {
        from_account_id: bank.id,
        to_account_id: cash.id,
        amount_minor: '200000',
        fee_amount_minor: '1000',
        fee_account_id: bankFees.id,
        currency: 'USD',
        transfer_date: '2026-01-14',
      },
    });

    // FT-09: Personal grocery 300 paid from business bank -> Owner Draws (profit unchanged!)
    await api('POST', '/v1/expenses', {
      orgId,
      idem: 'pers-draw',
      body: {
        expense_date: '2026-01-15',
        description: 'Personal grocery',
        amount_minor: '30000',
        currency: 'USD',
        owner_scope: 'personal',
        paid_from: 'business_bank',
        expense_account_id: draws.id,
        payment_account_id: bank.id,
        party_id: ownerParty.id,
      },
    });

    // FT-26: Salary 1,500 accrued then paid (counted once in expense!)
    const salAccrual = (
      await api<{ salary_run: SalaryRunDto }>('POST', '/v1/salary-runs', {
        orgId,
        idem: 'sal-acc',
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
    const salPaid = await api<{ salary_run: SalaryRunDto }>(
      'POST',
      `/v1/salary-runs/${salAccrual.id}/pay`,
      {
        orgId,
        idem: 'sal-pay',
        body: {
          payment_date: '2026-01-28',
          bank_account_id: bank.id,
          salaries_payable_account_id: salPay.id,
        },
      }
    );
    expect(salPaid.data.salary_run.status).toBe('paid');

    // Close Jan 2026
    await api('POST', `/v1/periods/${janPeriod.id}/close`, { orgId, body: {} });

    // Agreement v1: 50/50 effective Jan (even though Investor has 70% shareholding!)
    await api('POST', '/v1/profit-sharing/agreements', {
      orgId,
      idem: 'agr-v1',
      body: {
        name: 'v1 50/50',
        effective_from: '2026-01-01',
        effective_to: '2026-01-31',
        lines: [
          { party_id: invParty.id, share_bps: 5000 },
          { party_id: ownerParty.id, share_bps: 5000 },
        ],
      },
    });

    // Agreement v2: 60/40 effective Feb
    await api('POST', '/v1/profit-sharing/agreements', {
      orgId,
      idem: 'agr-v2',
      body: {
        name: 'v2 60/40',
        effective_from: '2026-02-01',
        lines: [
          { party_id: invParty.id, share_bps: 6000 },
          { party_id: ownerParty.id, share_bps: 4000 },
        ],
      },
    });

    // Run Jan distribution -> FT-18 Net Profit = 2,490.00 (249000 minor), 50/50 = 124500 each
    const distRes = await api<{ distribution: ProfitDistributionDto }>(
      'POST',
      '/v1/profit-sharing/distributions',
      {
        orgId,
        idem: 'dist-jan',
        body: {
          period_id: janPeriod.id,
          distribution_date: '2026-02-01',
          retained_earnings_account_id: retEarn.id,
          due_to_partner_account_id: duePartner.id,
        },
      }
    );
    expect(distRes.status).toBe(201);
    const dist = distRes.data.distribution;

    expect(dist.net_profit_minor).toBe('249000');
    expect(dist.lines).toEqual([
      { party_id: invParty.id, share_bps: 5000, amount_minor: '124500' },
      { party_id: ownerParty.id, share_bps: 5000, amount_minor: '124500' },
    ]);

    // Pay distribution separately
    const paidDist = await api<{ distribution: ProfitDistributionDto }>(
      'POST',
      `/v1/profit-sharing/distributions/${dist.id}/pay`,
      {
        orgId,
        idem: 'dist-pay',
        body: {
          payment_date: '2026-02-01',
          bank_account_id: bank.id,
          due_to_partner_account_id: duePartner.id,
        },
      }
    );
    expect(paidDist.data.distribution.status).toBe('paid');

    // FT-19 Trial Balance remains balanced
    const tb = (
      await api<{ report: TrialBalanceReportDto }>('GET', '/v1/trial-balance?as_of_date=2026-02-05', {
        orgId,
      })
    ).data.report;
    expect(tb.is_balanced).toBe(true);
  });

  it('FT-10, FT-25, FT-31, FT-35: Personal payment of company expense, partial AP allocations, individual ledger, and GDPR pseudonymization', async () => {
    const { api, orgId, byCode } = await createPhase5Harness();
    const bank = byCode('1000');
    const ap = byCode('2000');
    const dueOwner = byCode('2300');
    const subs = byCode('5400');

    const supplier = (
      await api<{ party: PartyDto }>('POST', '/v1/parties', {
        orgId,
        idem: 'sup-1',
        body: { party_type: 'supplier', display_name: 'Supplier Co', email: 'ap@supplier.test' },
      })
    ).data.party;

    // FT-10: Company software 50.00 paid personally by owner -> Expense + Due to Owner
    const crossExp = await api('POST', '/v1/expenses', {
      orgId,
      idem: 'cross-1',
      body: {
        expense_date: '2026-11-10',
        description: 'Software paid personally',
        amount_minor: '5000',
        currency: 'USD',
        owner_scope: 'company',
        paid_from: 'personal_funds',
        expense_account_id: subs.id,
        payment_account_id: dueOwner.id,
        party_id: supplier.id,
      },
    });
    expect(crossExp.status).toBe(201);

    // FT-25: 100.00 supplier bill settled 40.00 then 60.00; over-allocation rejected
    const bill = (
      await api<{ document: InvoiceBillDto }>('POST', '/v1/invoices-bills', {
        orgId,
        idem: 'bill-1',
        body: {
          kind: 'bill',
          doc_number: 'BILL-001',
          party_id: supplier.id,
          issue_date: '2026-11-11',
          due_date: '2026-11-30',
          total_minor: '10000',
          currency: 'USD',
          category_account_id: subs.id,
          control_account_id: ap.id,
          purpose: 'Packaging supplies',
        },
      })
    ).data.document;

    const alloc1 = await api<{ document: InvoiceBillDto }>(
      'POST',
      `/v1/invoices-bills/${bill.id}/allocate`,
      {
        orgId,
        idem: 'alloc-1',
        body: {
          payment_date: '2026-11-12',
          amount_minor: '4000',
          currency: 'USD',
          bank_account_ledger_id: bank.id,
          control_account_id: ap.id,
        },
      }
    );
    expect(alloc1.data.document.remaining_minor).toBe('6000');
    expect(alloc1.data.document.status).toBe('partially_settled');

    const overAlloc = await api('POST', `/v1/invoices-bills/${bill.id}/allocate`, {
      orgId,
      idem: 'alloc-over',
      body: {
        payment_date: '2026-11-13',
        amount_minor: '6001',
        currency: 'USD',
        bank_account_ledger_id: bank.id,
        control_account_id: ap.id,
      },
    });
    expect(overAlloc.status).toBe(422);

    const alloc2 = await api<{ document: InvoiceBillDto }>(
      'POST',
      `/v1/invoices-bills/${bill.id}/allocate`,
      {
        orgId,
        idem: 'alloc-2',
        body: {
          payment_date: '2026-11-14',
          amount_minor: '6000',
          currency: 'USD',
          bank_account_ledger_id: bank.id,
          control_account_id: ap.id,
        },
      }
    );
    expect(alloc2.data.document.remaining_minor).toBe('0');
    expect(alloc2.data.document.status).toBe('settled');

    // FT-31: Individual ledger reflects posted lines tagged to party
    const ledgerBefore = (
      await api<{ ledger: IndividualLedgerDto }>('GET', `/v1/parties/${supplier.id}/ledger`, {
        orgId,
      })
    ).data.ledger;
    expect(ledgerBefore.lines.length).toBeGreaterThan(0);
    const tbBefore = (
      await api<{ report: TrialBalanceReportDto }>('GET', '/v1/trial-balance?as_of_date=2026-11-30', {
        orgId,
      })
    ).data.report;

    // FT-35: GDPR pseudonymization keeps every ledger amount & Trial Balance untouched
    const pseudo = await api<{ party: PartyDto }>(
      'POST',
      `/v1/parties/${supplier.id}/pseudonymize`,
      { orgId, body: {} }
    );
    expect(pseudo.status).toBe(200);
    expect(pseudo.data.party.email_redacted).toBeNull();
    expect(pseudo.data.party.pseudonymized_at).toBeTruthy();

    const tbAfter = (
      await api<{ report: TrialBalanceReportDto }>('GET', '/v1/trial-balance?as_of_date=2026-11-30', {
        orgId,
      })
    ).data.report;
    expect(tbAfter.total_debits_minor).toBe(tbBefore.total_debits_minor);
    expect(tbAfter.total_credits_minor).toBe(tbBefore.total_credits_minor);
  });

  it('Capitalizes fixed assets to Asset account and rejects expensing via Asset endpoint', async () => {
    const { api, orgId, byCode } = await createPhase5Harness();
    const badAsset = await api('POST', '/v1/assets', {
      orgId,
      idem: 'asset-bad',
      body: {
        name: 'Laptop',
        category: 'laptop',
        purchase_date: '2026-11-20',
        purchase_cost_minor: '120000',
        currency: 'USD',
        asset_account_id: byCode('5400').id, // Expense account rejected
        payment_account_id: byCode('1000').id,
      },
    });
    expect(badAsset.status).toBe(422);

    const goodAsset = await api<{ asset: AssetDto }>('POST', '/v1/assets', {
      orgId,
      idem: 'asset-good',
      body: {
        name: 'Laptop',
        category: 'laptop',
        purchase_date: '2026-11-20',
        purchase_cost_minor: '120000',
        currency: 'USD',
        asset_account_id: byCode('1500').id,
        payment_account_id: byCode('1000').id,
      },
    });
    expect(goodAsset.status).toBe(201);
    expect(goodAsset.data.asset.book_value_minor).toBe('120000');
  });
});
