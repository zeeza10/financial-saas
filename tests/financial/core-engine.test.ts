import { SignJWT } from 'jose';
import { describe, expect, it } from 'vitest';
import type {
  AccountDto,
  BankAccountDto,
  BankTransactionDto,
  JournalEntryDto,
  PeriodDto,
  ReconciliationDto,
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

async function createCoreTestHarness() {
  const store = new InMemoryDataStore();
  const ownerId = '11111111-1111-1111-1111-111111111111';
  const token = await new SignJWT({ email: 'owner@test.local', aal: 'aal2' })
    .setProtectedHeader({ alg: 'HS256' })
    .setSubject(ownerId)
    .setAudience('authenticated')
    .setIssuedAt()
    .setExpirationTime('1h')
    .sign(new TextEncoder().encode(TEST_ENV.TEST_JWT_SECRET!));

  const authGateway: AuthGateway = {
    async signup() {},
    async loginWithPassword() {
      return { userId: ownerId, email: 'owner@test.local', accessToken: token, aal: 'aal2' };
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
      body: JSON.stringify({ email: 'owner@test.local', password: 'ValidStrongPassword123!' }),
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
    body: { name: 'eBay Seller Co', base_currency: 'USD', country: 'US' },
    idem: 'init-org',
  });
  const orgId = orgRes.data.organization.id;

  const seedRes = await api<{ items: AccountDto[] }>('POST', '/v1/accounts/seed-template', {
    orgId,
    body: {},
    idem: 'seed-coa',
  });
  const accounts = seedRes.data.items;
  const byCode = (c: string) => accounts.find((a) => a.code === c)!;

  return { api, orgId, accounts, byCode };
}

describe('Phase 4 Core Financial Engine Integration (FT-01..FT-33)', () => {
  it('FT-01, FT-02, FT-21, FT-22, FT-33, OQ-026: eBay clearing payout, gapless numbering, reversal, and double-reversal lock', async () => {
    const { api, orgId, byCode } = await createCoreTestHarness();
    const bank = byCode('1000');
    const clearing = byCode('1050');
    const fees = byCode('5100');
    const sales = byCode('4000');

    // FT-33: Gross sale 100.00, fee 13.00 -> Dr Clearing 87.00, Dr Fees 13.00, Cr Sales 100.00
    const saleDraft = await api<{ entry: JournalEntryDto }>('POST', '/v1/journal-entries', {
      orgId,
      idem: 'sale-draft',
      body: {
        entry_date: '2026-11-10',
        description: 'eBay Managed Payments Payout #101',
        kind: 'standard',
        lines: [
          { account_id: clearing.id, side: 'debit', amount_minor: '8700', currency: 'USD' },
          { account_id: fees.id, side: 'debit', amount_minor: '1300', currency: 'USD' },
          { account_id: sales.id, side: 'credit', amount_minor: '10000', currency: 'USD' },
        ],
      },
    });
    expect(saleDraft.status).toBe(201);

    const posted1 = await api<{ entry: JournalEntryDto }>(
      'POST',
      `/v1/journal-entries/${saleDraft.data.entry.id}/post`,
      { orgId, body: {}, idem: 'post-1' }
    );
    expect(posted1.status).toBe(200);
    expect(posted1.data.entry.entry_no).toBe('1');

    // Payout deposit clears clearing to 0
    const depDraft = await api<{ entry: JournalEntryDto }>('POST', '/v1/journal-entries', {
      orgId,
      idem: 'dep-draft',
      body: {
        entry_date: '2026-11-11',
        description: 'eBay Payout hits bank',
        kind: 'transfer',
        lines: [
          { account_id: bank.id, side: 'debit', amount_minor: '8700', currency: 'USD' },
          { account_id: clearing.id, side: 'credit', amount_minor: '8700', currency: 'USD' },
        ],
      },
    });
    const posted2 = await api<{ entry: JournalEntryDto }>(
      'POST',
      `/v1/journal-entries/${depDraft.data.entry.id}/post`,
      { orgId, body: {}, idem: 'post-2' }
    );
    expect(posted2.data.entry.entry_no).toBe('2');

    // Unbalanced draft rejected on post (FT-02)
    const unbalDraft = await api<{ entry: JournalEntryDto }>('POST', '/v1/journal-entries', {
      orgId,
      idem: 'unbal-draft',
      body: {
        entry_date: '2026-11-11',
        description: 'Unbalanced entry',
        lines: [
          { account_id: bank.id, side: 'debit', amount_minor: '10000', currency: 'USD' },
          { account_id: sales.id, side: 'credit', amount_minor: '9999', currency: 'USD' },
        ],
      },
    });
    const unbalPost = await api('POST', `/v1/journal-entries/${unbalDraft.data.entry.id}/post`, {
      orgId,
      body: {},
      idem: 'post-unbal',
    });
    expect(unbalPost.status).toBe(422);

    // Check Trial Balance before reversal: Clearing = 0, Bank = 8700, Fees = 1300, Sales = 10000
    const tb1 = await api<{ report: TrialBalanceReportDto }>(
      'GET',
      '/v1/trial-balance?as_of_date=2026-11-30',
      { orgId }
    );
    expect(tb1.data.report.is_balanced).toBe(true);
    const clearingRow = tb1.data.report.rows.find((r) => r.code === '1050')!;
    expect(clearingRow.net_balance_minor).toBe('0');

    // FT-21: Reverse entry #1 -> gets gapless entry_no = '3'
    const rev1 = await api<{ entry: JournalEntryDto }>(
      'POST',
      `/v1/journal-entries/${posted1.data.entry.id}/reverse`,
      {
        orgId,
        idem: 'rev-1',
        body: { reason: 'Order cancelled before ship', reversal_date: '2026-11-12' },
      }
    );
    expect(rev1.status).toBe(201);
    expect(rev1.data.entry.entry_no).toBe('3');

    // FT-22: Double reversal rejected
    const rev2 = await api('POST', `/v1/journal-entries/${posted1.data.entry.id}/reverse`, {
      orgId,
      idem: 'rev-2',
      body: { reason: 'Duplicate reversal attempt' },
    });
    expect(rev2.status).toBe(409);
  });

  it('FT-06, FT-07, FT-11: Internal transfer with wire fee leaves revenue unchanged; personal account excluded from company Trial Balance', async () => {
    const { api, orgId, byCode } = await createCoreTestHarness();
    const bankA = byCode('1000');
    const cashB = byCode('1010');
    const bankFees = byCode('5300');
    const personalBank = byCode('1900');

    const transferRes = await api('POST', '/v1/transfers', {
      orgId,
      idem: 'xfer-1',
      body: {
        from_account_id: bankA.id,
        to_account_id: cashB.id,
        amount_minor: '200000',
        fee_amount_minor: '1000',
        fee_account_id: bankFees.id,
        currency: 'USD',
        transfer_date: '2026-11-15',
        description: 'Fund petty cash',
      },
    });
    expect(transferRes.status).toBe(201);

    // Personal account posting
    const personalDraft = await api<{ entry: JournalEntryDto }>('POST', '/v1/journal-entries', {
      orgId,
      idem: 'pers-1',
      body: {
        entry_date: '2026-11-15',
        description: 'Personal savings deposit',
        lines: [
          { account_id: personalBank.id, side: 'debit', amount_minor: '300000', currency: 'USD' },
          { account_id: byCode('3200').id, side: 'credit', amount_minor: '300000', currency: 'USD' },
        ],
      },
    });
    await api('POST', `/v1/journal-entries/${personalDraft.data.entry.id}/post`, {
      orgId,
      body: {},
      idem: 'pers-post',
    });

    const tb = await api<{ report: TrialBalanceReportDto }>(
      'GET',
      '/v1/trial-balance?as_of_date=2026-11-30',
      { orgId }
    );
    expect(tb.data.report.rows.some((r) => r.code === '1900')).toBe(false);
    expect(tb.data.report.rows.find((r) => r.code === '4000')!.net_balance_minor).toBe('0');
    expect(tb.data.report.rows.find((r) => r.code === '5300')!.net_balance_minor).toBe('1000');
  });

  it('FT-15, FT-16, FT-27: CSV duplicate protection, posting, and 1:1 locked bank reconciliation', async () => {
    const { api, orgId, byCode } = await createCoreTestHarness();
    const bankLedger = byCode('1000');
    const sales = byCode('4000');

    const baRes = await api<{ bank_account: BankAccountDto }>('POST', '/v1/bank-accounts', {
      orgId,
      idem: 'ba-1',
      body: {
        account_id: bankLedger.id,
        institution: 'Mercury',
        last4: '4821',
        ownership_type: 'business',
        opening_balance_minor: '0',
        currency: 'USD',
      },
    });
    expect(baRes.status).toBe(201);
    const baId = baRes.data.bank_account.id;

    // Malformed CSV rejected atomically
    const badCsv = await api('POST', '/v1/imports', {
      orgId,
      idem: 'csv-bad',
      body: {
        bank_account_id: baId,
        csv_text: 'date,description,amount\n2026-11-01,Good,10.00\nbad-date,Bad,20.00',
      },
    });
    expect(badCsv.status).toBe(422);

    // Import valid row with external_id + fingerprint duplicate row without external_id
    const imp1 = await api<{ imported: number; duplicate_held: number }>('POST', '/v1/imports', {
      orgId,
      idem: 'csv-1',
      body: {
        bank_account_id: baId,
        csv_text: [
          'date,description,amount,external_id',
          '2026-11-05,eBay Payout,87.00,ext-100',
          '2026-11-06,Cash Deposit,50.00,',
        ].join('\n'),
      },
    });
    expect(imp1.status).toBe(201);
    expect(imp1.data.imported).toBe(2);
    expect(imp1.data.duplicate_held).toBe(0);

    // FT-15: Same external_id rejected (409)
    const dupExt = await api('POST', '/v1/imports', {
      orgId,
      idem: 'csv-dup-ext',
      body: {
        bank_account_id: baId,
        csv_text: 'date,description,amount,external_id\n2026-11-05,eBay Payout,87.00,ext-100',
      },
    });
    expect(dupExt.status).toBe(409);

    // FT-16: Same fingerprint without external_id held for review
    const dupFp = await api<{ imported: number; duplicate_held: number }>('POST', '/v1/imports', {
      orgId,
      idem: 'csv-dup-fp',
      body: {
        bank_account_id: baId,
        csv_text: 'date,description,amount,external_id\n2026-11-06,  cash   deposit ,50.00,',
      },
    });
    expect(dupFp.status).toBe(201);
    expect(dupFp.data.duplicate_held).toBe(1);

    // Post the ready transactions
    const txsRes = await api<{ items: BankTransactionDto[] }>('GET', '/v1/bank-transactions', { orgId });
    const readyTxs = txsRes.data.items.filter((t) => t.status === 'ready');
    expect(readyTxs).toHaveLength(2);

    const postedEntryIds: string[] = [];
    for (let i = 0; i < readyTxs.length; i++) {
      const tx = readyTxs[i]!;
      const postRes = await api<{ entry: JournalEntryDto }>(
        'POST',
        `/v1/bank-transactions/${tx.id}/post`,
        {
          orgId,
          idem: `post-tx-${i}`,
          body: { offset_account_id: sales.id },
        }
      );
      expect(postRes.status).toBe(200);
      postedEntryIds.push(postRes.data.entry.id);
    }

    // FT-27: Start reconciliation ending balance = 87.00 + 50.00 = 137.00 (13700)
    const recStart = await api<{ reconciliation: ReconciliationDto }>('POST', '/v1/reconciliations', {
      orgId,
      idem: 'rec-start',
      body: {
        bank_account_id: baId,
        statement_date: '2026-11-30',
        statement_ending_balance_minor: '13700',
      },
    });
    const recId = recStart.data.reconciliation.id;

    // Cannot complete while difference != 0
    const earlyComplete = await api('POST', `/v1/reconciliations/${recId}/complete`, {
      orgId,
      body: {},
    });
    expect(earlyComplete.status).toBe(422);

    await api('POST', `/v1/reconciliations/${recId}/match`, {
      orgId,
      body: { bank_transaction_id: readyTxs[0]!.id, journal_entry_id: postedEntryIds[0]! },
    });

    // Cannot match same bank tx twice (409)
    const dupMatch = await api('POST', `/v1/reconciliations/${recId}/match`, {
      orgId,
      body: { bank_transaction_id: readyTxs[0]!.id, journal_entry_id: postedEntryIds[1]! },
    });
    expect(dupMatch.status).toBe(409);

    await api('POST', `/v1/reconciliations/${recId}/match`, {
      orgId,
      body: { bank_transaction_id: readyTxs[1]!.id, journal_entry_id: postedEntryIds[1]! },
    });

    const completed = await api<{ reconciliation: ReconciliationDto }>(
      'POST',
      `/v1/reconciliations/${recId}/complete`,
      { orgId, body: {} }
    );
    expect(completed.status).toBe(200);
    expect(completed.data.reconciliation.status).toBe('completed');
    expect(completed.data.reconciliation.difference_minor).toBe('0');
  });

  it('FT-23, FT-24: Period close rejects backdated posts; Owner reopens with written reason', async () => {
    const { api, orgId, byCode } = await createCoreTestHarness();
    const pRes = await api<{ period: PeriodDto }>('POST', '/v1/periods', {
      orgId,
      idem: 'p-1',
      body: { name: 'Oct 2026', start_date: '2026-10-01', end_date: '2026-10-31' },
    });
    const periodId = pRes.data.period.id;

    const closed = await api<{ period: PeriodDto }>('POST', `/v1/periods/${periodId}/close`, {
      orgId,
      body: {},
    });
    expect(closed.status).toBe(200);
    expect(closed.data.period.tb_hash).toHaveLength(64);

    // Posting dated inside closed period fails (FT-23)
    const draft = await api<{ entry: JournalEntryDto }>('POST', '/v1/journal-entries', {
      orgId,
      idem: 'backdate',
      body: {
        entry_date: '2026-10-15',
        description: 'Backdated entry',
        lines: [
          { account_id: byCode('1000').id, side: 'debit', amount_minor: '100', currency: 'USD' },
          { account_id: byCode('4000').id, side: 'credit', amount_minor: '100', currency: 'USD' },
        ],
      },
    });
    const postClosed = await api('POST', `/v1/journal-entries/${draft.data.entry.id}/post`, {
      orgId,
      body: {},
      idem: 'post-backdate',
    });
    expect(postClosed.status).toBe(422);

    // Reopen without sufficient reason rejected (422)
    const badReopen = await api('POST', `/v1/periods/${periodId}/reopen`, {
      orgId,
      body: { reason: 'short' },
    });
    expect(badReopen.status).toBe(422);

    // Owner reopen with valid written reason succeeds
    const goodReopen = await api<{ period: PeriodDto }>('POST', `/v1/periods/${periodId}/reopen`, {
      orgId,
      body: { reason: 'Late supplier invoice adjustment approved by Owner' },
    });
    expect(goodReopen.status).toBe(200);
    expect(goodReopen.data.period.status).toBe('open');
  });
});
