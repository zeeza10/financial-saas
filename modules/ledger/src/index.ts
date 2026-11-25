import {
  ApiDomainError,
  hasRolePermission,
  type AccountDto,
  type AuthUser,
  type CreateAccountRequest,
  type CreateJournalDraftRequest,
  type CreatePeriodRequest,
  type JournalEntryDto,
  type JournalLineDto,
  type PeriodDto,
  type PlatformContext,
  type ReopenPeriodRequest,
  type ReverseJournalEntryRequest,
  type TrialBalanceReportDto,
} from '@financial-saas/contracts';
import {
  DEFAULT_COA_TEMPLATE,
  JournalValidationError,
  buildReversalLines,
  computeTrialBalance,
  validateJournalEntryForPost,
  type JournalLineInput,
} from '@financial-saas/ledger-core';

export { SupabaseLedgerStore, type SupabaseConfig } from './supabase.js';

export interface LedgerStore {
  listAccounts(user: AuthUser, orgId: string): Promise<AccountDto[]>;
  createAccount(
    user: AuthUser,
    orgId: string,
    input: CreateAccountRequest & { is_system?: boolean }
  ): Promise<AccountDto>;
  seedDefaultCoa(user: AuthUser, orgId: string): Promise<AccountDto[]>;
  listPeriods(user: AuthUser, orgId: string): Promise<PeriodDto[]>;
  createPeriod(user: AuthUser, orgId: string, input: CreatePeriodRequest): Promise<PeriodDto>;
  closePeriod(user: AuthUser, orgId: string, periodId: string, requestId: string): Promise<PeriodDto>;
  reopenPeriod(
    user: AuthUser,
    orgId: string,
    periodId: string,
    reason: string,
    requestId: string
  ): Promise<PeriodDto>;
  listJournalEntries(user: AuthUser, orgId: string): Promise<JournalEntryDto[]>;
  createDraftEntry(user: AuthUser, orgId: string, input: CreateJournalDraftRequest): Promise<JournalEntryDto>;
  postJournalEntry(user: AuthUser, orgId: string, entryId: string, requestId: string): Promise<JournalEntryDto>;
  reverseJournalEntry(
    user: AuthUser,
    orgId: string,
    entryId: string,
    input: ReverseJournalEntryRequest,
    requestId: string
  ): Promise<JournalEntryDto>;
}

/**
 * In-memory LedgerStore enforcing BR-001..BR-004, BR-008, BR-013, BR-018, OQ-026
 * for deterministic local/CI verification matching SQL rules.
 */
export class InMemoryLedgerStore implements LedgerStore {
  private readonly accounts = new Map<string, AccountDto>();
  private readonly periods = new Map<string, PeriodDto>();
  private readonly entries = new Map<string, JournalEntryDto>();
  private readonly sequences = new Map<string, bigint>();

  constructor(private readonly ctx: PlatformContext) {}

  async listAccounts(_user: AuthUser, orgId: string): Promise<AccountDto[]> {
    return Array.from(this.accounts.values())
      .filter((a) => a.organization_id === orgId)
      .sort((a, b) => a.code.localeCompare(b.code));
  }

  async createAccount(
    _user: AuthUser,
    orgId: string,
    input: CreateAccountRequest & { is_system?: boolean }
  ): Promise<AccountDto> {
    const duplicate = Array.from(this.accounts.values()).find(
      (a) => a.organization_id === orgId && a.code.toLowerCase() === input.code.toLowerCase()
    );
    if (duplicate) {
      throw new ApiDomainError(409, `Account code "${input.code}" already exists`);
    }
    const account: AccountDto = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      code: input.code,
      name: input.name,
      account_type: input.account_type,
      ownership_type: input.ownership_type ?? 'business',
      is_system: input.is_system ?? false,
      is_active: true,
      parent_id: input.parent_id ?? null,
      created_at: new Date().toISOString(),
    };
    this.accounts.set(account.id, account);
    return account;
  }

  async seedDefaultCoa(user: AuthUser, orgId: string): Promise<AccountDto[]> {
    const existing = await this.listAccounts(user, orgId);
    const existingCodes = new Set(existing.map((a) => a.code));
    for (const tpl of DEFAULT_COA_TEMPLATE) {
      if (!existingCodes.has(tpl.code)) {
        await this.createAccount(user, orgId, tpl);
      }
    }
    return this.listAccounts(user, orgId);
  }

  async listPeriods(_user: AuthUser, orgId: string): Promise<PeriodDto[]> {
    return Array.from(this.periods.values())
      .filter((p) => p.organization_id === orgId)
      .sort((a, b) => a.start_date.localeCompare(b.start_date));
  }

  async createPeriod(_user: AuthUser, orgId: string, input: CreatePeriodRequest): Promise<PeriodDto> {
    if (input.end_date < input.start_date) {
      throw new ApiDomainError(422, 'Period end_date cannot precede start_date');
    }
    const overlap = Array.from(this.periods.values()).find(
      (p) =>
        p.organization_id === orgId &&
        !(input.end_date < p.start_date || input.start_date > p.end_date)
    );
    if (overlap) {
      throw new ApiDomainError(409, 'Accounting period overlaps an existing period');
    }
    const period: PeriodDto = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      name: input.name,
      start_date: input.start_date,
      end_date: input.end_date,
      status: 'open',
      tb_hash: null,
      closed_at: null,
      reopened_reason: null,
    };
    this.periods.set(period.id, period);
    return period;
  }

  async closePeriod(
    user: AuthUser,
    orgId: string,
    periodId: string,
    requestId: string
  ): Promise<PeriodDto> {
    const period = this.periods.get(periodId);
    if (!period || period.organization_id !== orgId) {
      throw new ApiDomainError(404, 'Accounting period not found');
    }
    if (period.status !== 'open') {
      throw new ApiDomainError(409, `Period is already ${period.status}`);
    }

    const baseCurrency = await this.ctx.getOrganizationBaseCurrency(user, orgId);
    const accounts = await this.listAccounts(user, orgId);
    const entries = await this.listJournalEntries(user, orgId);
    const tb = computeTrialBalance({
      organizationId: orgId,
      baseCurrency,
      asOfDate: period.end_date,
      accounts,
      entries,
    });
    if (!tb.is_balanced) {
      throw new ApiDomainError(409, 'BR-018: Trial Balance is unbalanced');
    }

    const digestBytes = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(`${orgId}|${period.id}|${tb.total_debits_minor}`)
    );
    const tbHash = Array.from(new Uint8Array(digestBytes))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');

    const closed: PeriodDto = {
      ...period,
      status: 'closed',
      tb_hash: tbHash,
      closed_at: new Date().toISOString(),
    };
    this.periods.set(periodId, closed);

    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'period.closed',
      entityType: 'accounting_period',
      entityId: periodId,
      payload: { tb_hash: tbHash, total_minor: tb.total_debits_minor },
      requestId,
    });

    return closed;
  }

  async reopenPeriod(
    user: AuthUser,
    orgId: string,
    periodId: string,
    reason: string,
    requestId: string
  ): Promise<PeriodDto> {
    const period = this.periods.get(periodId);
    if (!period || period.organization_id !== orgId) {
      throw new ApiDomainError(404, 'Accounting period not found');
    }
    if (period.status !== 'closed') {
      throw new ApiDomainError(409, `Only closed periods can be reopened (current: ${period.status})`);
    }

    const reopened: PeriodDto = {
      ...period,
      status: 'open',
      reopened_reason: reason,
    };
    this.periods.set(periodId, reopened);

    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'period.reopened',
      entityType: 'accounting_period',
      entityId: periodId,
      payload: { reason },
      requestId,
    });

    return reopened;
  }

  async listJournalEntries(_user: AuthUser, orgId: string): Promise<JournalEntryDto[]> {
    return Array.from(this.entries.values())
      .filter((e) => e.organization_id === orgId)
      .sort((a, b) => a.created_at.localeCompare(b.created_at))
      .map((e) => ({
        ...e,
        lines: e.lines.map((l) => ({ ...l })),
      }));
  }

  async createDraftEntry(
    user: AuthUser,
    orgId: string,
    input: CreateJournalDraftRequest
  ): Promise<JournalEntryDto> {
    if (input.external_id) {
      const dup = Array.from(this.entries.values()).find(
        (e) =>
          e.organization_id === orgId &&
          e.source === input.source &&
          e.external_id === input.external_id
      );
      if (dup) {
        throw new ApiDomainError(409, 'BR-013: Duplicate external_id for organization');
      }
    }

    const entryId = crypto.randomUUID();
    const lines: JournalLineDto[] = [];
    for (let i = 0; i < input.lines.length; i++) {
      const l = input.lines[i]!;
      const acc = this.accounts.get(l.account_id);
      if (!acc || acc.organization_id !== orgId || !acc.is_active) {
        throw new ApiDomainError(404, `Account ${l.account_id} not found in organization`);
      }
      lines.push({
        id: crypto.randomUUID(),
        organization_id: orgId,
        entry_id: entryId,
        line_no: i + 1,
        account_id: l.account_id,
        party_id: l.party_id ?? null,
        side: l.side,
        amount_minor: l.amount_minor,
        currency: l.currency,
        memo: l.memo ?? null,
      });
    }

    const draft: JournalEntryDto = {
      id: entryId,
      organization_id: orgId,
      entry_no: null,
      entry_date: input.entry_date,
      description: input.description,
      kind: input.kind,
      status: 'draft',
      reverses_entry_id: null,
      source: input.source,
      external_id: input.external_id ?? null,
      posted_by: null,
      posted_at: null,
      created_at: new Date().toISOString(),
      lines,
    };
    this.entries.set(entryId, draft);
    return { ...draft, lines: draft.lines.map((l) => ({ ...l })) };
  }

  async postJournalEntry(
    user: AuthUser,
    orgId: string,
    entryId: string,
    requestId: string
  ): Promise<JournalEntryDto> {
    const entry = this.entries.get(entryId);
    if (!entry || entry.organization_id !== orgId) {
      throw new ApiDomainError(404, 'Journal entry not found');
    }
    if (entry.status === 'posted') {
      return { ...entry, lines: entry.lines.map((l) => ({ ...l })) };
    }

    const baseCurrency = await this.ctx.getOrganizationBaseCurrency(user, orgId);
    const matchingPeriod = Array.from(this.periods.values()).find(
      (p) =>
        p.organization_id === orgId &&
        entry.entry_date >= p.start_date &&
        entry.entry_date <= p.end_date
    );
    const periodStatus = matchingPeriod?.status ?? 'open';

    const validationLines: JournalLineInput[] = entry.lines.map((l) => {
      const acc = this.accounts.get(l.account_id);
      if (!acc || acc.organization_id !== orgId || !acc.is_active) {
        throw new ApiDomainError(404, `Account ${l.account_id} not found`);
      }
      return {
        accountId: l.account_id,
        accountType: acc.account_type,
        ownershipType: acc.ownership_type,
        side: l.side,
        amountMinor: BigInt(l.amount_minor),
        currency: l.currency,
        partyId: l.party_id,
      };
    });

    try {
      validateJournalEntryForPost({
        kind: entry.kind,
        baseCurrency,
        periodStatus,
        lines: validationLines,
      });
    } catch (err) {
      if (err instanceof JournalValidationError) {
        throw new ApiDomainError(422, err.message);
      }
      throw err;
    }

    // OQ-026: Gapless per-organization entry number
    const nextNo = this.sequences.get(orgId) ?? 1n;
    this.sequences.set(orgId, nextNo + 1n);

    const posted: JournalEntryDto = {
      ...entry,
      status: 'posted',
      entry_no: nextNo.toString(),
      posted_by: user.userId,
      posted_at: new Date().toISOString(),
    };
    this.entries.set(entryId, posted);

    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'journal.posted',
      entityType: 'journal_entry',
      entityId: entryId,
      payload: { entry_no: posted.entry_no },
      requestId,
    });

    return { ...posted, lines: posted.lines.map((l) => ({ ...l })) };
  }

  async reverseJournalEntry(
    user: AuthUser,
    orgId: string,
    entryId: string,
    input: ReverseJournalEntryRequest,
    requestId: string
  ): Promise<JournalEntryDto> {
    const orig = this.entries.get(entryId);
    if (!orig || orig.organization_id !== orgId) {
      throw new ApiDomainError(404, 'Journal entry not found');
    }
    if (orig.status !== 'posted') {
      throw new ApiDomainError(422, 'BR-003: Only posted journal entries can be reversed');
    }

    const alreadyReversed = Array.from(this.entries.values()).find(
      (e) => e.organization_id === orgId && e.reverses_entry_id === entryId
    );
    if (alreadyReversed) {
      throw new ApiDomainError(409, 'FT-22: Entry has already been reversed');
    }

    const revDate = input.reversal_date ?? new Date().toISOString().slice(0, 10);
    const revDraftId = crypto.randomUUID();

    const origLineInputs: JournalLineInput[] = orig.lines.map((l) => {
      const acc = this.accounts.get(l.account_id)!;
      return {
        accountId: l.account_id,
        accountType: acc.account_type,
        ownershipType: acc.ownership_type,
        side: l.side,
        amountMinor: BigInt(l.amount_minor),
        currency: l.currency,
        partyId: l.party_id,
      };
    });

    const swapped = buildReversalLines(origLineInputs);
    const revLines: JournalLineDto[] = swapped.map((l, idx) => ({
      id: crypto.randomUUID(),
      organization_id: orgId,
      entry_id: revDraftId,
      line_no: idx + 1,
      account_id: l.accountId,
      party_id: l.partyId ?? null,
      side: l.side,
      amount_minor: l.amountMinor.toString(),
      currency: l.currency,
      memo: orig.lines[idx]?.memo ?? null,
    }));

    const revDraft: JournalEntryDto = {
      id: revDraftId,
      organization_id: orgId,
      entry_no: null,
      entry_date: revDate,
      description: `Reversal of #${orig.entry_no}: ${input.reason}`,
      kind: 'reversal',
      status: 'draft',
      reverses_entry_id: entryId,
      source: 'reversal',
      external_id: null,
      posted_by: null,
      posted_at: null,
      created_at: new Date().toISOString(),
      lines: revLines,
    };
    this.entries.set(revDraftId, revDraft);
    const posted = await this.postJournalEntry(user, orgId, revDraftId, requestId);

    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'journal.reversed',
      entityType: 'journal_entry',
      entityId: posted.id,
      payload: { reverses_entry_id: entryId, reason: input.reason },
      requestId,
    });

    return posted;
  }
}

/**
 * Public interface of modules/ledger (MODULE_ARCHITECTURE.md: ONLY this module writes ledger tables).
 */
export class LedgerModule {
  constructor(
    private readonly ctx: PlatformContext,
    private readonly store: LedgerStore
  ) {}

  async listAccounts(user: AuthUser, orgId: string): Promise<AccountDto[]> {
    await this.ctx.requirePermission(user, orgId, 'accounts:read');
    return this.store.listAccounts(user, orgId);
  }

  async seedDefaultCoa(user: AuthUser, orgId: string, requestId: string): Promise<AccountDto[]> {
    await this.ctx.requirePermission(user, orgId, 'accounts:write');
    const accounts = await this.store.seedDefaultCoa(user, orgId);
    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'accounts.template_seeded',
      entityType: 'account',
      entityId: null,
      payload: { count: accounts.length },
      requestId,
    });
    return accounts;
  }

  async createAccount(
    user: AuthUser,
    orgId: string,
    input: CreateAccountRequest,
    requestId: string
  ): Promise<AccountDto> {
    await this.ctx.requirePermission(user, orgId, 'accounts:write');
    const account = await this.store.createAccount(user, orgId, input);
    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'account.created',
      entityType: 'account',
      entityId: account.id,
      payload: { code: account.code, account_type: account.account_type, ownership_type: account.ownership_type },
      requestId,
    });
    return account;
  }

  async listPeriods(user: AuthUser, orgId: string): Promise<PeriodDto[]> {
    await this.ctx.requirePermission(user, orgId, 'reports:read');
    return this.store.listPeriods(user, orgId);
  }

  async createPeriod(
    user: AuthUser,
    orgId: string,
    input: CreatePeriodRequest,
    requestId: string
  ): Promise<PeriodDto> {
    await this.ctx.requirePermission(user, orgId, 'period:close');
    const period = await this.store.createPeriod(user, orgId, input);
    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'period.created',
      entityType: 'accounting_period',
      entityId: period.id,
      payload: { name: period.name, start_date: period.start_date, end_date: period.end_date },
      requestId,
    });
    return period;
  }

  async closePeriod(
    user: AuthUser,
    orgId: string,
    periodId: string,
    requestId: string
  ): Promise<PeriodDto> {
    await this.ctx.requirePermission(user, orgId, 'period:close');
    return this.store.closePeriod(user, orgId, periodId, requestId);
  }

  async reopenPeriod(
    user: AuthUser,
    orgId: string,
    periodId: string,
    input: ReopenPeriodRequest,
    requestId: string
  ): Promise<PeriodDto> {
    await this.ctx.requirePermission(user, orgId, 'period:reopen');
    return this.store.reopenPeriod(user, orgId, periodId, input.reason, requestId);
  }

  async listJournalEntries(user: AuthUser, orgId: string): Promise<JournalEntryDto[]> {
    await this.ctx.requirePermission(user, orgId, 'reports:read');
    return this.store.listJournalEntries(user, orgId);
  }

  async listEntriesForReports(user: AuthUser, orgId: string): Promise<JournalEntryDto[]> {
    const { role } = await this.ctx.requirePermission(user, orgId, 'organizations:read');
    if (
      !hasRolePermission(role, 'reports:read') &&
      !hasRolePermission(role, 'reports:read_scoped')
    ) {
      throw new ApiDomainError(403, 'Insufficient permissions');
    }
    return this.store.listJournalEntries(user, orgId);
  }

  async createDraftEntry(
    user: AuthUser,
    orgId: string,
    input: CreateJournalDraftRequest
  ): Promise<JournalEntryDto> {
    await this.ctx.requirePermission(user, orgId, 'ledger:draft');
    return this.store.createDraftEntry(user, orgId, input);
  }

  async postJournalEntry(
    user: AuthUser,
    orgId: string,
    entryId: string,
    requestId: string
  ): Promise<JournalEntryDto> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    return this.store.postJournalEntry(user, orgId, entryId, requestId);
  }

  async createAndPostEntry(
    user: AuthUser,
    orgId: string,
    input: CreateJournalDraftRequest,
    requestId: string
  ): Promise<JournalEntryDto> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    const draft = await this.store.createDraftEntry(user, orgId, input);
    return this.store.postJournalEntry(user, orgId, draft.id, requestId);
  }

  async reverseJournalEntry(
    user: AuthUser,
    orgId: string,
    entryId: string,
    input: ReverseJournalEntryRequest,
    requestId: string
  ): Promise<JournalEntryDto> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    return this.store.reverseJournalEntry(user, orgId, entryId, input, requestId);
  }

  async getTrialBalance(
    user: AuthUser,
    orgId: string,
    asOfDate: string,
    includePersonal = false
  ): Promise<TrialBalanceReportDto> {
    await this.ctx.requirePermission(user, orgId, 'reports:read');
    const [baseCurrency, accounts, entries] = await Promise.all([
      this.ctx.getOrganizationBaseCurrency(user, orgId),
      this.store.listAccounts(user, orgId),
      this.store.listJournalEntries(user, orgId),
    ]);
    return computeTrialBalance({
      organizationId: orgId,
      baseCurrency,
      asOfDate,
      accounts,
      entries,
      includePersonal,
    });
  }
}
