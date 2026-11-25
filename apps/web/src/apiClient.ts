import type {
  AccountDto,
  AccrueSalaryRequest,
  AllocatePaymentRequest,
  AssetDto,
  AuditEventDto,
  BankAccountDto,
  BankTransactionDto,
  CreateAccountRequest,
  CreateAssetRequest,
  CreateBankAccountRequest,
  CreateInvoiceBillRequest,
  CreateJournalDraftRequest,
  CreateLiabilityRequest,
  CreateOrganizationRequest,
  CreatePartyRequest,
  CreatePeriodRequest,
  CreateProfitShareAgreementRequest,
  CreateTransferRequest,
  ImportCsvTransactionsRequest,
  IndividualLedgerDto,
  InvestorContributionRequest,
  InviteMemberRequest,
  InvoiceBillDto,
  JournalEntryDto,
  LiabilityDto,
  MatchReconciliationRequest,
  MemberDto,
  OrganizationDto,
  OrgRole,
  PartyDto,
  PayDistributionRequest,
  PaySalaryRunRequest,
  PeriodDto,
  PostBankTransactionRequest,
  ProfitDistributionDto,
  ProfitShareAgreementDto,
  ReconciliationDto,
  RecordEbayPayoutRequest,
  RecordExpenseRequest,
  RunProfitDistributionRequest,
  SalaryRunDto,
  StartReconciliationRequest,
  TrialBalanceReportDto,
} from '@financial-saas/contracts';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? '';

let cachedCsrfToken: string | null = null;

function readCookie(name: string): string | null {
  const parts = document.cookie.split(';');
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const k = part.slice(0, eq).trim();
    if (k === name) {
      return decodeURIComponent(part.slice(eq + 1).trim());
    }
  }
  return null;
}

function getCsrfToken(): string | null {
  return (
    cachedCsrfToken ??
    readCookie('__Host-fs_csrf') ??
    readCookie('fs_csrf')
  );
}

export class ApiClientError extends Error {
  constructor(
    readonly status: number,
    message: string,
    readonly detail?: string
  ) {
    super(detail ? `${message}: ${detail}` : message);
  }
}

async function request<T>(
  path: string,
  options: {
    method?: string;
    body?: unknown;
    organizationId?: string;
    idempotencyKey?: string;
  } = {}
): Promise<T> {
  const method = (options.method ?? 'GET').toUpperCase();
  const headers = new Headers();

  if (options.body !== undefined) {
    headers.set('Content-Type', 'application/json');
  }
  if (options.organizationId) {
    headers.set('X-Organization-Id', options.organizationId);
  }
  if (options.idempotencyKey) {
    headers.set('Idempotency-Key', options.idempotencyKey);
  }
  if (method !== 'GET' && method !== 'HEAD') {
    const csrf = getCsrfToken();
    if (csrf) {
      headers.set('X-CSRF-Token', csrf);
    }
  }

  const fetchInit: RequestInit = {
    method,
    credentials: 'include',
    headers,
  };
  if (options.body !== undefined) {
    fetchInit.body = JSON.stringify(options.body);
  }

  const res = await fetch(`${API_BASE}${path}`, fetchInit);
  const json = (await res.json().catch(() => null)) as Record<string, unknown> | null;
  if (!res.ok) {
    const title = typeof json?.['title'] === 'string' ? json['title'] : `Request failed (${res.status})`;
    const detail = typeof json?.['detail'] === 'string' ? json['detail'] : undefined;
    throw new ApiClientError(res.status, title, detail);
  }
  return json as T;
}

export interface SessionUser {
  id: string;
  email: string;
  aal: 'aal1' | 'aal2';
}

export const apiClient = {
  async getSession(): Promise<{ authenticated: boolean; user: SessionUser } | null> {
    try {
      const data = await request<{
        authenticated: boolean;
        user: SessionUser;
        csrf_token: string | null;
      }>('/v1/auth/session');
      if (data.csrf_token) cachedCsrfToken = data.csrf_token;
      return { authenticated: data.authenticated, user: data.user };
    } catch (err) {
      if (err instanceof ApiClientError && err.status === 401) {
        return null;
      }
      throw err;
    }
  },

  async login(email: string, password: string): Promise<SessionUser> {
    const data = await request<{ user: SessionUser; csrf_token: string }>('/v1/auth/login', {
      method: 'POST',
      body: { email, password },
    });
    cachedCsrfToken = data.csrf_token;
    return data.user;
  },

  async signup(email: string, password: string, displayName: string): Promise<void> {
    await request('/v1/auth/signup', {
      method: 'POST',
      body: { email, password, display_name: displayName },
    });
  },

  async logout(): Promise<void> {
    await request('/v1/auth/logout', { method: 'POST', body: {} });
    cachedCsrfToken = null;
  },

  async listOrganizations(): Promise<OrganizationDto[]> {
    const res = await request<{ items: OrganizationDto[] }>('/v1/organizations');
    return res.items;
  },

  async createOrganization(input: CreateOrganizationRequest): Promise<OrganizationDto> {
    const res = await request<{ organization: OrganizationDto }>('/v1/organizations', {
      method: 'POST',
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
    return res.organization;
  },

  async listMembers(organizationId: string): Promise<MemberDto[]> {
    const res = await request<{ items: MemberDto[] }>('/v1/members', { organizationId });
    return res.items;
  },

  async inviteMember(organizationId: string, input: InviteMemberRequest): Promise<MemberDto> {
    const res = await request<{ member: MemberDto }>('/v1/members/invite', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
    return res.member;
  },

  async updateMemberRole(
    organizationId: string,
    memberId: string,
    role: OrgRole
  ): Promise<MemberDto> {
    const res = await request<{ member: MemberDto }>(`/v1/members/${memberId}`, {
      method: 'PATCH',
      organizationId,
      body: { role },
    });
    return res.member;
  },

  async listAuditEvents(organizationId: string): Promise<AuditEventDto[]> {
    const res = await request<{ items: AuditEventDto[] }>('/v1/audit-events?limit=50', {
      organizationId,
    });
    return res.items;
  },

  async verifyAuditChain(organizationId: string): Promise<boolean> {
    const res = await request<{ valid: boolean }>('/v1/audit-events/verify', {
      method: 'POST',
      organizationId,
      body: {},
    });
    return res.valid;
  },

  // --- Phase 4: Core Financial Engine ---
  async listAccounts(organizationId: string): Promise<AccountDto[]> {
    const res = await request<{ items: AccountDto[] }>('/v1/accounts', { organizationId });
    return res.items;
  },

  async seedCoaTemplate(organizationId: string): Promise<AccountDto[]> {
    const res = await request<{ items: AccountDto[] }>('/v1/accounts/seed-template', {
      method: 'POST',
      organizationId,
      body: {},
      idempotencyKey: crypto.randomUUID(),
    });
    return res.items;
  },

  async createAccount(organizationId: string, input: CreateAccountRequest): Promise<AccountDto> {
    const res = await request<{ account: AccountDto }>('/v1/accounts', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
    return res.account;
  },

  async listPeriods(organizationId: string): Promise<PeriodDto[]> {
    const res = await request<{ items: PeriodDto[] }>('/v1/periods', { organizationId });
    return res.items;
  },

  async createPeriod(organizationId: string, input: CreatePeriodRequest): Promise<PeriodDto> {
    const res = await request<{ period: PeriodDto }>('/v1/periods', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
    return res.period;
  },

  async closePeriod(organizationId: string, periodId: string): Promise<PeriodDto> {
    const res = await request<{ period: PeriodDto }>(`/v1/periods/${periodId}/close`, {
      method: 'POST',
      organizationId,
      body: {},
    });
    return res.period;
  },

  async reopenPeriod(organizationId: string, periodId: string, reason: string): Promise<PeriodDto> {
    const res = await request<{ period: PeriodDto }>(`/v1/periods/${periodId}/reopen`, {
      method: 'POST',
      organizationId,
      body: { reason },
    });
    return res.period;
  },

  async listJournalEntries(organizationId: string): Promise<JournalEntryDto[]> {
    const res = await request<{ items: JournalEntryDto[] }>('/v1/journal-entries', { organizationId });
    return res.items;
  },

  async createJournalDraft(
    organizationId: string,
    input: CreateJournalDraftRequest
  ): Promise<JournalEntryDto> {
    const res = await request<{ entry: JournalEntryDto }>('/v1/journal-entries', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
    return res.entry;
  },

  async postJournalEntry(organizationId: string, entryId: string): Promise<JournalEntryDto> {
    const res = await request<{ entry: JournalEntryDto }>(`/v1/journal-entries/${entryId}/post`, {
      method: 'POST',
      organizationId,
      body: {},
      idempotencyKey: crypto.randomUUID(),
    });
    return res.entry;
  },

  async reverseJournalEntry(
    organizationId: string,
    entryId: string,
    reason: string
  ): Promise<JournalEntryDto> {
    const res = await request<{ entry: JournalEntryDto }>(`/v1/journal-entries/${entryId}/reverse`, {
      method: 'POST',
      organizationId,
      body: { reason },
      idempotencyKey: crypto.randomUUID(),
    });
    return res.entry;
  },

  async getTrialBalance(
    organizationId: string,
    asOfDate: string
  ): Promise<TrialBalanceReportDto> {
    const res = await request<{ report: TrialBalanceReportDto }>(
      `/v1/trial-balance?as_of_date=${encodeURIComponent(asOfDate)}`,
      { organizationId }
    );
    return res.report;
  },

  async listBankAccounts(organizationId: string): Promise<BankAccountDto[]> {
    const res = await request<{ items: BankAccountDto[] }>('/v1/bank-accounts', { organizationId });
    return res.items;
  },

  async createBankAccount(
    organizationId: string,
    input: CreateBankAccountRequest
  ): Promise<BankAccountDto> {
    const res = await request<{ bank_account: BankAccountDto }>('/v1/bank-accounts', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
    return res.bank_account;
  },

  async createTransfer(organizationId: string, input: CreateTransferRequest): Promise<void> {
    await request('/v1/transfers', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
  },

  async listBankTransactions(organizationId: string): Promise<BankTransactionDto[]> {
    const res = await request<{ items: BankTransactionDto[] }>('/v1/bank-transactions', {
      organizationId,
    });
    return res.items;
  },

  async importCsv(
    organizationId: string,
    input: ImportCsvTransactionsRequest
  ): Promise<{ imported: number; duplicate_held: number }> {
    return request('/v1/imports', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
  },

  async postBankTransaction(
    organizationId: string,
    txId: string,
    input: PostBankTransactionRequest
  ): Promise<void> {
    await request(`/v1/bank-transactions/${txId}/post`, {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
  },

  async listReconciliations(organizationId: string): Promise<ReconciliationDto[]> {
    const res = await request<{ items: ReconciliationDto[] }>('/v1/reconciliations', {
      organizationId,
    });
    return res.items;
  },

  async startReconciliation(
    organizationId: string,
    input: StartReconciliationRequest
  ): Promise<ReconciliationDto> {
    const res = await request<{ reconciliation: ReconciliationDto }>('/v1/reconciliations', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
    return res.reconciliation;
  },

  async matchReconciliation(
    organizationId: string,
    recId: string,
    input: MatchReconciliationRequest
  ): Promise<ReconciliationDto> {
    const res = await request<{ reconciliation: ReconciliationDto }>(
      `/v1/reconciliations/${recId}/match`,
      {
        method: 'POST',
        organizationId,
        body: input,
      }
    );
    return res.reconciliation;
  },

  async completeReconciliation(organizationId: string, recId: string): Promise<ReconciliationDto> {
    const res = await request<{ reconciliation: ReconciliationDto }>(
      `/v1/reconciliations/${recId}/complete`,
      {
        method: 'POST',
        organizationId,
        body: {},
      }
    );
    return res.reconciliation;
  },

  // --- Phase 5: Business Modules ---
  async listParties(organizationId: string): Promise<PartyDto[]> {
    const res = await request<{ items: PartyDto[] }>('/v1/parties', { organizationId });
    return res.items;
  },

  async createParty(organizationId: string, input: CreatePartyRequest): Promise<PartyDto> {
    const res = await request<{ party: PartyDto }>('/v1/parties', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
    return res.party;
  },

  async getIndividualLedger(organizationId: string, partyId: string): Promise<IndividualLedgerDto> {
    const res = await request<{ ledger: IndividualLedgerDto }>(`/v1/parties/${partyId}/ledger`, {
      organizationId,
    });
    return res.ledger;
  },

  async recordExpense(organizationId: string, input: RecordExpenseRequest): Promise<void> {
    await request('/v1/expenses', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
  },

  async listInvoicesBills(organizationId: string): Promise<InvoiceBillDto[]> {
    const res = await request<{ items: InvoiceBillDto[] }>('/v1/invoices-bills', { organizationId });
    return res.items;
  },

  async createInvoiceBill(
    organizationId: string,
    input: CreateInvoiceBillRequest
  ): Promise<InvoiceBillDto> {
    const res = await request<{ document: InvoiceBillDto }>('/v1/invoices-bills', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
    return res.document;
  },

  async allocatePayment(
    organizationId: string,
    docId: string,
    input: AllocatePaymentRequest
  ): Promise<InvoiceBillDto> {
    const res = await request<{ document: InvoiceBillDto }>(`/v1/invoices-bills/${docId}/allocate`, {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
    return res.document;
  },

  async recordInvestorContribution(
    organizationId: string,
    input: InvestorContributionRequest
  ): Promise<void> {
    await request('/v1/investors/contributions', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
  },

  async listProfitShareAgreements(organizationId: string): Promise<ProfitShareAgreementDto[]> {
    const res = await request<{ items: ProfitShareAgreementDto[] }>('/v1/profit-sharing/agreements', {
      organizationId,
    });
    return res.items;
  },

  async createProfitShareAgreement(
    organizationId: string,
    input: CreateProfitShareAgreementRequest
  ): Promise<ProfitShareAgreementDto> {
    const res = await request<{ agreement: ProfitShareAgreementDto }>(
      '/v1/profit-sharing/agreements',
      {
        method: 'POST',
        organizationId,
        body: input,
        idempotencyKey: crypto.randomUUID(),
      }
    );
    return res.agreement;
  },

  async listProfitDistributions(organizationId: string): Promise<ProfitDistributionDto[]> {
    const res = await request<{ items: ProfitDistributionDto[] }>(
      '/v1/profit-sharing/distributions',
      { organizationId }
    );
    return res.items;
  },

  async runProfitDistribution(
    organizationId: string,
    input: RunProfitDistributionRequest
  ): Promise<ProfitDistributionDto> {
    const res = await request<{ distribution: ProfitDistributionDto }>(
      '/v1/profit-sharing/distributions',
      {
        method: 'POST',
        organizationId,
        body: input,
        idempotencyKey: crypto.randomUUID(),
      }
    );
    return res.distribution;
  },

  async payDistribution(
    organizationId: string,
    distId: string,
    input: PayDistributionRequest
  ): Promise<ProfitDistributionDto> {
    const res = await request<{ distribution: ProfitDistributionDto }>(
      `/v1/profit-sharing/distributions/${distId}/pay`,
      {
        method: 'POST',
        organizationId,
        body: input,
        idempotencyKey: crypto.randomUUID(),
      }
    );
    return res.distribution;
  },

  async listSalaryRuns(organizationId: string): Promise<SalaryRunDto[]> {
    const res = await request<{ items: SalaryRunDto[] }>('/v1/salary-runs', { organizationId });
    return res.items;
  },

  async accrueSalary(organizationId: string, input: AccrueSalaryRequest): Promise<SalaryRunDto> {
    const res = await request<{ salary_run: SalaryRunDto }>('/v1/salary-runs', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
    return res.salary_run;
  },

  async paySalaryRun(
    organizationId: string,
    runId: string,
    input: PaySalaryRunRequest
  ): Promise<SalaryRunDto> {
    const res = await request<{ salary_run: SalaryRunDto }>(`/v1/salary-runs/${runId}/pay`, {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
    return res.salary_run;
  },

  async listAssets(organizationId: string): Promise<AssetDto[]> {
    const res = await request<{ items: AssetDto[] }>('/v1/assets', { organizationId });
    return res.items;
  },

  async createAsset(organizationId: string, input: CreateAssetRequest): Promise<AssetDto> {
    const res = await request<{ asset: AssetDto }>('/v1/assets', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
    return res.asset;
  },

  async listLiabilities(organizationId: string): Promise<LiabilityDto[]> {
    const res = await request<{ items: LiabilityDto[] }>('/v1/liabilities', { organizationId });
    return res.items;
  },

  async createLiability(
    organizationId: string,
    input: CreateLiabilityRequest
  ): Promise<LiabilityDto> {
    const res = await request<{ liability: LiabilityDto }>('/v1/liabilities', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
    return res.liability;
  },

  async recordEbayPayout(organizationId: string, input: RecordEbayPayoutRequest): Promise<void> {
    await request('/v1/ebay/payouts', {
      method: 'POST',
      organizationId,
      body: input,
      idempotencyKey: crypto.randomUUID(),
    });
  },
};
