import {
  ApiDomainError,
  hasRolePermission,
  type AccrueSalaryRequest,
  type AllocatePaymentRequest,
  type AssetDto,
  type AuthUser,
  type CompensationArrangementDto,
  type CreateAssetRequest,
  type CreateCompensationArrangementRequest,
  type CreateInvoiceBillRequest,
  type CreateLiabilityRequest,
  type CreatePartyRequest,
  type CreateProfitShareAgreementRequest,
  type IndividualLedgerDto,
  type IndividualLedgerLineDto,
  type InvestorContributionRequest,
  type InvoiceBillDto,
  type JournalEntryDto,
  type LiabilityDto,
  type PartyDto,
  type PayDistributionRequest,
  type PaySalaryRunRequest,
  type PlatformContext,
  type ProfitDistributionDto,
  type ProfitShareAgreementDto,
  type RecordEbayPayoutRequest,
  type RecordExpenseRequest,
  type RunProfitDistributionRequest,
  type SalaryRunDto,
} from '@financial-saas/contracts';
import {
  allocateByBasisPoints,
  computeProfitAndLoss,
  money,
} from '@financial-saas/ledger-core';
import type { LedgerModule } from '@financial-saas/ledger';

export { SupabaseOperationsStore } from './supabase.js';

export interface OperationsStore {
  listParties(user: AuthUser, orgId: string): Promise<PartyDto[]>;
  getParty(user: AuthUser, orgId: string, partyId: string): Promise<PartyDto | null>;
  createParty(user: AuthUser, orgId: string, input: CreatePartyRequest): Promise<PartyDto>;
  pseudonymizeParty(user: AuthUser, orgId: string, partyId: string, requestId: string): Promise<PartyDto>;
  listInvoicesBills(user: AuthUser, orgId: string): Promise<InvoiceBillDto[]>;
  saveInvoiceBill(user: AuthUser, orgId: string, doc: InvoiceBillDto): Promise<void>;
  getInvoiceBill(user: AuthUser, orgId: string, docId: string): Promise<InvoiceBillDto | null>;
  updateInvoiceBill(user: AuthUser, orgId: string, doc: InvoiceBillDto): Promise<void>;
  listAgreements(user: AuthUser, orgId: string): Promise<ProfitShareAgreementDto[]>;
  saveAgreement(user: AuthUser, orgId: string, agreement: ProfitShareAgreementDto): Promise<void>;
  listDistributions(user: AuthUser, orgId: string): Promise<ProfitDistributionDto[]>;
  saveDistribution(user: AuthUser, orgId: string, dist: ProfitDistributionDto): Promise<void>;
  getDistribution(user: AuthUser, orgId: string, distId: string): Promise<ProfitDistributionDto | null>;
  updateDistribution(user: AuthUser, orgId: string, dist: ProfitDistributionDto): Promise<void>;
  listCompensationArrangements(user: AuthUser, orgId: string): Promise<CompensationArrangementDto[]>;
  saveCompensationArrangement(user: AuthUser, orgId: string, arr: CompensationArrangementDto): Promise<void>;
  listSalaryRuns(user: AuthUser, orgId: string): Promise<SalaryRunDto[]>;
  saveSalaryRun(user: AuthUser, orgId: string, run: SalaryRunDto): Promise<void>;
  getSalaryRun(user: AuthUser, orgId: string, runId: string): Promise<SalaryRunDto | null>;
  updateSalaryRun(user: AuthUser, orgId: string, run: SalaryRunDto): Promise<void>;
  listAssets(user: AuthUser, orgId: string): Promise<AssetDto[]>;
  saveAsset(user: AuthUser, orgId: string, asset: AssetDto): Promise<void>;
  listLiabilities(user: AuthUser, orgId: string): Promise<LiabilityDto[]>;
  saveLiability(user: AuthUser, orgId: string, liability: LiabilityDto): Promise<void>;
}

export class InMemoryOperationsStore implements OperationsStore {
  private readonly parties = new Map<string, PartyDto>();
  private readonly invoicesBills = new Map<string, InvoiceBillDto>();
  private readonly agreements = new Map<string, ProfitShareAgreementDto>();
  private readonly distributions = new Map<string, ProfitDistributionDto>();
  private readonly compensations = new Map<string, CompensationArrangementDto>();
  private readonly salaryRuns = new Map<string, SalaryRunDto>();
  private readonly assets = new Map<string, AssetDto>();
  private readonly liabilities = new Map<string, LiabilityDto>();

  constructor(private readonly ctx: PlatformContext) {}

  async listParties(_user: AuthUser, orgId: string): Promise<PartyDto[]> {
    return Array.from(this.parties.values()).filter((p) => p.organization_id === orgId);
  }

  async getParty(_user: AuthUser, orgId: string, partyId: string): Promise<PartyDto | null> {
    const p = this.parties.get(partyId);
    return p && p.organization_id === orgId ? { ...p } : null;
  }

  async createParty(_user: AuthUser, orgId: string, input: CreatePartyRequest): Promise<PartyDto> {
    const party: PartyDto = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      party_type: input.party_type,
      display_name: input.display_name,
      email_redacted: input.email ? input.email.replace(/(^.).*(@.*$)/, '$1***$2') : null,
      shareholding_bps: input.shareholding_bps ?? 0,
      pseudonymized_at: null,
      created_at: new Date().toISOString(),
    };
    this.parties.set(party.id, party);
    return party;
  }

  async pseudonymizeParty(
    user: AuthUser,
    orgId: string,
    partyId: string,
    requestId: string
  ): Promise<PartyDto> {
    const p = this.parties.get(partyId);
    if (!p || p.organization_id !== orgId) {
      throw new ApiDomainError(404, 'Party not found');
    }
    const updated: PartyDto = {
      ...p,
      display_name: `Pseudonymized Party ${p.id.slice(0, 8)}`,
      email_redacted: null,
      pseudonymized_at: new Date().toISOString(),
    };
    this.parties.set(partyId, updated);
    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'party.pseudonymized',
      entityType: 'party',
      entityId: partyId,
      payload: { br: 'BR-019' },
      requestId,
    });
    return updated;
  }

  async listInvoicesBills(_user: AuthUser, orgId: string): Promise<InvoiceBillDto[]> {
    return Array.from(this.invoicesBills.values()).filter((d) => d.organization_id === orgId);
  }

  async saveInvoiceBill(_user: AuthUser, _orgId: string, doc: InvoiceBillDto): Promise<void> {
    const dup = Array.from(this.invoicesBills.values()).find(
      (d) => d.organization_id === doc.organization_id && d.kind === doc.kind && d.doc_number === doc.doc_number
    );
    if (dup) throw new ApiDomainError(409, 'Document number already exists');
    this.invoicesBills.set(doc.id, doc);
  }

  async getInvoiceBill(_user: AuthUser, orgId: string, docId: string): Promise<InvoiceBillDto | null> {
    const d = this.invoicesBills.get(docId);
    return d && d.organization_id === orgId ? { ...d } : null;
  }

  async updateInvoiceBill(_user: AuthUser, _orgId: string, doc: InvoiceBillDto): Promise<void> {
    this.invoicesBills.set(doc.id, doc);
  }

  async listAgreements(_user: AuthUser, orgId: string): Promise<ProfitShareAgreementDto[]> {
    return Array.from(this.agreements.values()).filter((a) => a.organization_id === orgId);
  }

  async saveAgreement(_user: AuthUser, _orgId: string, agreement: ProfitShareAgreementDto): Promise<void> {
    this.agreements.set(agreement.id, agreement);
  }

  async listDistributions(_user: AuthUser, orgId: string): Promise<ProfitDistributionDto[]> {
    return Array.from(this.distributions.values()).filter((d) => d.organization_id === orgId);
  }

  async saveDistribution(_user: AuthUser, _orgId: string, dist: ProfitDistributionDto): Promise<void> {
    const dup = Array.from(this.distributions.values()).find(
      (d) => d.organization_id === dist.organization_id && d.period_id === dist.period_id
    );
    if (dup) throw new ApiDomainError(409, 'A profit distribution already exists for this closed period');
    this.distributions.set(dist.id, dist);
  }

  async getDistribution(_user: AuthUser, orgId: string, distId: string): Promise<ProfitDistributionDto | null> {
    const d = this.distributions.get(distId);
    return d && d.organization_id === orgId ? { ...d } : null;
  }

  async updateDistribution(_user: AuthUser, _orgId: string, dist: ProfitDistributionDto): Promise<void> {
    this.distributions.set(dist.id, dist);
  }

  async listCompensationArrangements(_user: AuthUser, orgId: string): Promise<CompensationArrangementDto[]> {
    return Array.from(this.compensations.values()).filter((c) => c.organization_id === orgId);
  }

  async saveCompensationArrangement(_user: AuthUser, _orgId: string, arr: CompensationArrangementDto): Promise<void> {
    this.compensations.set(arr.id, arr);
  }

  async listSalaryRuns(_user: AuthUser, orgId: string): Promise<SalaryRunDto[]> {
    return Array.from(this.salaryRuns.values()).filter((s) => s.organization_id === orgId);
  }

  async saveSalaryRun(_user: AuthUser, _orgId: string, run: SalaryRunDto): Promise<void> {
    this.salaryRuns.set(run.id, run);
  }

  async getSalaryRun(_user: AuthUser, orgId: string, runId: string): Promise<SalaryRunDto | null> {
    const s = this.salaryRuns.get(runId);
    return s && s.organization_id === orgId ? { ...s } : null;
  }

  async updateSalaryRun(_user: AuthUser, _orgId: string, run: SalaryRunDto): Promise<void> {
    this.salaryRuns.set(run.id, run);
  }

  async listAssets(_user: AuthUser, orgId: string): Promise<AssetDto[]> {
    return Array.from(this.assets.values()).filter((a) => a.organization_id === orgId);
  }

  async saveAsset(_user: AuthUser, _orgId: string, asset: AssetDto): Promise<void> {
    this.assets.set(asset.id, asset);
  }

  async listLiabilities(_user: AuthUser, orgId: string): Promise<LiabilityDto[]> {
    return Array.from(this.liabilities.values()).filter((l) => l.organization_id === orgId);
  }

  async saveLiability(_user: AuthUser, _orgId: string, liability: LiabilityDto): Promise<void> {
    this.liabilities.set(liability.id, liability);
  }
}

/**
 * Public interface of modules/operations (Phase 5).
 * Delegates all ledger postings exclusively to LedgerModule (MODULE_ARCHITECTURE.md).
 */
export class OperationsModule {
  constructor(
    private readonly ctx: PlatformContext,
    private readonly ledger: LedgerModule,
    private readonly store: OperationsStore
  ) {}

  async listParties(user: AuthUser, orgId: string): Promise<PartyDto[]> {
    await this.ctx.requirePermission(user, orgId, 'organizations:read');
    return this.store.listParties(user, orgId);
  }

  async createParty(
    user: AuthUser,
    orgId: string,
    input: CreatePartyRequest,
    requestId: string
  ): Promise<PartyDto> {
    await this.ctx.requirePermission(user, orgId, 'members:write');
    const party = await this.store.createParty(user, orgId, input);
    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'party.created',
      entityType: 'party',
      entityId: party.id,
      payload: { party_type: party.party_type, shareholding_bps: party.shareholding_bps },
      requestId,
    });
    return party;
  }

  async pseudonymizeParty(
    user: AuthUser,
    orgId: string,
    partyId: string,
    requestId: string
  ): Promise<PartyDto> {
    await this.ctx.requirePermission(user, orgId, 'members:write');
    return this.store.pseudonymizeParty(user, orgId, partyId, requestId);
  }

  /**
   * BR-017 / FT-31 / F9: Individual ledger is a filtered view of posted journal lines tagged with party_id.
   * Investors and Employees can only view their own linked party_id (foreign IDs return 404).
   */
  async getIndividualLedger(
    user: AuthUser,
    orgId: string,
    partyId: string
  ): Promise<IndividualLedgerDto> {
    const { role } = await this.ctx.requirePermission(user, orgId, 'organizations:read');
    const canReadAll = hasRolePermission(role, 'individual_ledger:read');
    const canReadOwn = hasRolePermission(role, 'individual_ledger:read_own');
    if (!canReadAll && !canReadOwn) {
      throw new ApiDomainError(403, 'Insufficient permissions');
    }
    if (!canReadAll && canReadOwn) {
      const ownPartyId = await this.ctx.getUserPartyId(user, orgId);
      if (!ownPartyId || ownPartyId !== partyId) {
        throw new ApiDomainError(404, 'Party ledger not found');
      }
    }

    const party = await this.store.getParty(user, orgId, partyId);
    if (!party) {
      throw new ApiDomainError(404, 'Party not found');
    }

    const [currency, entries] = await Promise.all([
      this.ctx.getOrganizationBaseCurrency(user, orgId),
      this.ledger.listJournalEntries(user, orgId),
    ]);

    const lines: IndividualLedgerLineDto[] = [];
    let debits = 0n;
    let credits = 0n;

    for (const entry of entries) {
      if (entry.status !== 'posted') continue;
      for (const line of entry.lines) {
        if (line.party_id !== partyId) continue;
        const amt = BigInt(line.amount_minor);
        if (line.side === 'debit') debits += amt;
        else credits += amt;
        lines.push({
          entry_id: entry.id,
          entry_no: entry.entry_no,
          entry_date: entry.entry_date,
          description: entry.description,
          account_id: line.account_id,
          side: line.side,
          amount_minor: line.amount_minor,
          currency: line.currency,
          memo: line.memo,
        });
      }
    }

    return {
      party,
      currency,
      total_debits_minor: debits.toString(),
      total_credits_minor: credits.toString(),
      net_balance_minor: (credits - debits).toString(),
      lines,
    };
  }

  /**
   * BR-009 / FT-09 / FT-10: Company vs Personal Expense classification.
   */
  async recordExpense(
    user: AuthUser,
    orgId: string,
    input: RecordExpenseRequest,
    requestId: string
  ): Promise<JournalEntryDto> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    const accounts = await this.ledger.listAccounts(user, orgId);
    const debitAcc = accounts.find((a) => a.id === input.expense_account_id);
    const creditAcc = accounts.find((a) => a.id === input.payment_account_id);
    if (!debitAcc || !creditAcc) {
      throw new ApiDomainError(404, 'Account not found');
    }

    if (input.owner_scope === 'personal' && input.paid_from === 'business_bank') {
      if (debitAcc.account_type !== 'equity' && debitAcc.account_type !== 'asset') {
        throw new ApiDomainError(
          422,
          'BR-009: Personal expense paid from business funds must post to Owner Draws (equity) or Due from Owner (asset), never a company expense'
        );
      }
    } else if (input.owner_scope === 'company') {
      if (debitAcc.account_type !== 'expense') {
        throw new ApiDomainError(422, 'Company expense must post to an expense account');
      }
      if (input.paid_from === 'personal_funds' && creditAcc.account_type !== 'liability') {
        throw new ApiDomainError(
          422,
          'BR-009: Company expense paid personally must credit a payable/Due to Owner liability account'
        );
      }
    }

    return this.ledger.createAndPostEntry(
      user,
      orgId,
      {
        entry_date: input.expense_date,
        description: input.description,
        kind: input.owner_scope === 'personal' ? 'owner_draw' : 'standard',
        source: 'expense',
        lines: [
          {
            account_id: input.expense_account_id,
            side: 'debit',
            amount_minor: input.amount_minor,
            currency: input.currency,
            party_id: input.party_id ?? null,
          },
          {
            account_id: input.payment_account_id,
            side: 'credit',
            amount_minor: input.amount_minor,
            currency: input.currency,
            party_id: input.party_id ?? null,
          },
        ],
      },
      requestId
    );
  }

  async listInvoicesBills(user: AuthUser, orgId: string): Promise<InvoiceBillDto[]> {
    await this.ctx.requirePermission(user, orgId, 'reports:read');
    return this.store.listInvoicesBills(user, orgId);
  }

  async createInvoiceBill(
    user: AuthUser,
    orgId: string,
    input: CreateInvoiceBillRequest,
    requestId: string
  ): Promise<InvoiceBillDto> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    const isReceivable = input.kind === 'invoice';

    const entry = await this.ledger.createAndPostEntry(
      user,
      orgId,
      {
        entry_date: input.issue_date,
        description: `${input.kind.toUpperCase()} ${input.doc_number}: ${input.purpose}`,
        kind: 'standard',
        source: input.kind,
        lines: isReceivable
          ? [
              {
                account_id: input.control_account_id,
                side: 'debit',
                amount_minor: input.total_minor,
                currency: input.currency,
                party_id: input.party_id,
              },
              {
                account_id: input.category_account_id,
                side: 'credit',
                amount_minor: input.total_minor,
                currency: input.currency,
                party_id: input.party_id,
              },
            ]
          : [
              {
                account_id: input.category_account_id,
                side: 'debit',
                amount_minor: input.total_minor,
                currency: input.currency,
                party_id: input.party_id,
              },
              {
                account_id: input.control_account_id,
                side: 'credit',
                amount_minor: input.total_minor,
                currency: input.currency,
                party_id: input.party_id,
              },
            ],
      },
      requestId
    );

    const doc: InvoiceBillDto = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      kind: input.kind,
      doc_number: input.doc_number,
      party_id: input.party_id,
      issue_date: input.issue_date,
      due_date: input.due_date,
      total_minor: input.total_minor,
      allocated_minor: '0',
      remaining_minor: input.total_minor,
      currency: input.currency,
      status: 'open',
      ledger_entry_id: entry.id,
      purpose: input.purpose,
      created_at: new Date().toISOString(),
    };
    await this.store.saveInvoiceBill(user, orgId, doc);
    return doc;
  }

  /**
   * BR-015 / FT-25: Open-item settlement; rejects over-allocation or settled items.
   */
  async allocatePayment(
    user: AuthUser,
    orgId: string,
    docId: string,
    input: AllocatePaymentRequest,
    requestId: string
  ): Promise<InvoiceBillDto> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    const doc = await this.store.getInvoiceBill(user, orgId, docId);
    if (!doc) throw new ApiDomainError(404, 'Invoice or bill not found');
    if (doc.status === 'settled') {
      throw new ApiDomainError(409, 'BR-015: Settled items cannot be reopened except by reversal');
    }

    const paymentAmt = BigInt(input.amount_minor);
    const remaining = BigInt(doc.remaining_minor);
    if (paymentAmt > remaining) {
      throw new ApiDomainError(422, 'FT-25/BR-015: Payment allocation exceeds remaining open balance');
    }

    const isReceivable = doc.kind === 'invoice';
    await this.ledger.createAndPostEntry(
      user,
      orgId,
      {
        entry_date: input.payment_date,
        description: `Settlement for ${doc.kind} ${doc.doc_number}`,
        kind: 'standard',
        source: 'payment_allocation',
        lines: isReceivable
          ? [
              {
                account_id: input.bank_account_ledger_id,
                side: 'debit',
                amount_minor: input.amount_minor,
                currency: input.currency,
                party_id: doc.party_id,
              },
              {
                account_id: input.control_account_id,
                side: 'credit',
                amount_minor: input.amount_minor,
                currency: input.currency,
                party_id: doc.party_id,
              },
            ]
          : [
              {
                account_id: input.control_account_id,
                side: 'debit',
                amount_minor: input.amount_minor,
                currency: input.currency,
                party_id: doc.party_id,
              },
              {
                account_id: input.bank_account_ledger_id,
                side: 'credit',
                amount_minor: input.amount_minor,
                currency: input.currency,
                party_id: doc.party_id,
              },
            ],
      },
      requestId
    );

    const newAllocated = BigInt(doc.allocated_minor) + paymentAmt;
    const newRemaining = BigInt(doc.total_minor) - newAllocated;
    const updated: InvoiceBillDto = {
      ...doc,
      allocated_minor: newAllocated.toString(),
      remaining_minor: newRemaining.toString(),
      status: newRemaining === 0n ? 'settled' : 'partially_settled',
    };
    await this.store.updateInvoiceBill(user, orgId, updated);
    return updated;
  }

  /**
   * BR-007 / FT-08 / OQ-003: Investor capital (equity or loan), optional wire fee, never revenue.
   */
  async recordInvestorContribution(
    user: AuthUser,
    orgId: string,
    input: InvestorContributionRequest,
    requestId: string
  ): Promise<JournalEntryDto> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    const gross = BigInt(input.gross_amount_minor);
    const fee = BigInt(input.wire_fee_minor);
    if (fee < 0n || fee >= gross) {
      throw new ApiDomainError(422, 'Wire fee must be >= 0 and less than gross contribution');
    }
    const netBank = gross - fee;
    const lines = [
      {
        account_id: input.bank_account_id,
        side: 'debit' as const,
        amount_minor: netBank.toString(),
        currency: input.currency,
        party_id: input.party_id,
      },
      ...(fee > 0n
        ? [
            {
              account_id: input.fee_account_id ?? (() => {
                throw new ApiDomainError(422, 'fee_account_id required when wire_fee_minor > 0');
              })(),
              side: 'debit' as const,
              amount_minor: fee.toString(),
              currency: input.currency,
              party_id: input.party_id,
            },
          ]
        : []),
      {
        account_id: input.capital_or_loan_account_id,
        side: 'credit' as const,
        amount_minor: gross.toString(),
        currency: input.currency,
        party_id: input.party_id,
      },
    ];

    return this.ledger.createAndPostEntry(
      user,
      orgId,
      {
        entry_date: input.contribution_date,
        description: input.description,
        kind: input.treatment === 'equity' ? 'investor_capital' : 'loan_proceeds',
        source: 'investor_contribution',
        lines,
      },
      requestId
    );
  }

  async listProfitShareAgreements(user: AuthUser, orgId: string): Promise<ProfitShareAgreementDto[]> {
    await this.ctx.requirePermission(user, orgId, 'profit_sharing:read');
    return this.store.listAgreements(user, orgId);
  }

  /**
   * BR-010 / FT-13: Versioned agreement percentages must sum to exactly 100.00% (10000 bps).
   */
  async createProfitShareAgreement(
    user: AuthUser,
    orgId: string,
    input: CreateProfitShareAgreementRequest,
    requestId: string
  ): Promise<ProfitShareAgreementDto> {
    await this.ctx.requirePermission(user, orgId, 'profit_sharing:write');
    const sumBps = input.lines.reduce((acc, l) => acc + l.share_bps, 0);
    if (sumBps !== 10_000) {
      throw new ApiDomainError(
        422,
        `FT-13/BR-010: Profit-sharing percentages must sum to 10000 bps (100%), got ${sumBps}`
      );
    }

    const agreement: ProfitShareAgreementDto = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      name: input.name,
      effective_from: input.effective_from,
      effective_to: input.effective_to ?? null,
      lines: input.lines,
      created_at: new Date().toISOString(),
    };
    await this.store.saveAgreement(user, orgId, agreement);

    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'profit_agreement.created',
      entityType: 'profit_share_agreement',
      entityId: agreement.id,
      payload: { effective_from: agreement.effective_from, effective_to: agreement.effective_to },
      requestId,
    });
    return agreement;
  }

  async listProfitDistributions(user: AuthUser, orgId: string): Promise<ProfitDistributionDto[]> {
    await this.ctx.requirePermission(user, orgId, 'profit_sharing:read');
    return this.store.listDistributions(user, orgId);
  }

  /**
   * BR-010, BR-011, OQ-027, FT-12, FT-14, FT-18, FT-34:
   * Computes accrual net profit for a closed period, applies the agreement effective in that period,
   * splits using largest-remainder rounding, stores an immutable snapshot, and posts entitlements.
   */
  async runProfitDistribution(
    user: AuthUser,
    orgId: string,
    input: RunProfitDistributionRequest,
    requestId: string
  ): Promise<ProfitDistributionDto> {
    await this.ctx.requirePermission(user, orgId, 'profit_sharing:run');
    const [periods, agreements, accounts, entries, currency] = await Promise.all([
      this.ledger.listPeriods(user, orgId),
      this.store.listAgreements(user, orgId),
      this.ledger.listAccounts(user, orgId),
      this.ledger.listJournalEntries(user, orgId),
      this.ctx.getOrganizationBaseCurrency(user, orgId),
    ]);

    const period = periods.find((p) => p.id === input.period_id);
    if (!period) throw new ApiDomainError(404, 'Accounting period not found');
    if (period.status !== 'closed') {
      throw new ApiDomainError(422, 'BR-011: Profit distribution requires a closed accounting period');
    }

    const agreement = agreements.find(
      (a) =>
        a.effective_from <= period.end_date &&
        (a.effective_to === null || a.effective_to >= period.end_date)
    );
    if (!agreement) {
      throw new ApiDomainError(422, 'No profit-sharing agreement effective for this period');
    }

    const pnl = computeProfitAndLoss({
      organizationId: orgId,
      baseCurrency: currency,
      startDate: period.start_date,
      endDate: period.end_date,
      accounts,
      entries,
    });

    const netProfit = BigInt(pnl.net_profit_minor);
    if (netProfit <= 0n) {
      throw new ApiDomainError(422, 'Distributable net profit must be positive');
    }

    const allocated = allocateByBasisPoints(
      money(netProfit, currency),
      agreement.lines.map((l) => BigInt(l.share_bps))
    );

    const distLines = agreement.lines.map((l, idx) => ({
      party_id: l.party_id,
      share_bps: l.share_bps,
      amount_minor: allocated[idx]!.amountMinor.toString(),
    }));

    const postingLines = [
      {
        account_id: input.retained_earnings_account_id,
        side: 'debit' as const,
        amount_minor: netProfit.toString(),
        currency,
      },
      ...distLines
        .filter((l) => BigInt(l.amount_minor) > 0n)
        .map((l) => ({
          account_id: input.due_to_partner_account_id,
          side: 'credit' as const,
          amount_minor: l.amount_minor,
          currency,
          party_id: l.party_id,
        })),
    ];

    const entry = await this.ledger.createAndPostEntry(
      user,
      orgId,
      {
        entry_date: input.distribution_date,
        description: `Profit distribution for ${period.name}`,
        kind: 'distribution',
        source: 'profit_distribution',
        lines: postingLines,
      },
      requestId
    );

    const dist: ProfitDistributionDto = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      period_id: period.id,
      agreement_id: agreement.id,
      net_profit_minor: netProfit.toString(),
      currency,
      ledger_entry_id: entry.id,
      status: 'approved_unpaid',
      lines: distLines,
      created_at: new Date().toISOString(),
    };
    await this.store.saveDistribution(user, orgId, dist);

    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'profit_distribution.executed',
      entityType: 'profit_distribution',
      entityId: dist.id,
      payload: { period_id: period.id, net_profit_minor: dist.net_profit_minor },
      requestId,
    });
    return dist;
  }

  async payDistribution(
    user: AuthUser,
    orgId: string,
    distId: string,
    input: PayDistributionRequest,
    requestId: string
  ): Promise<ProfitDistributionDto> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    const dist = await this.store.getDistribution(user, orgId, distId);
    if (!dist) throw new ApiDomainError(404, 'Distribution not found');
    if (dist.status === 'paid') {
      throw new ApiDomainError(409, 'Distribution is already paid');
    }

    const lines = [
      ...dist.lines
        .filter((l) => BigInt(l.amount_minor) > 0n)
        .map((l) => ({
          account_id: input.due_to_partner_account_id,
          side: 'debit' as const,
          amount_minor: l.amount_minor,
          currency: dist.currency,
          party_id: l.party_id,
        })),
      {
        account_id: input.bank_account_id,
        side: 'credit' as const,
        amount_minor: dist.net_profit_minor,
        currency: dist.currency,
      },
    ];

    await this.ledger.createAndPostEntry(
      user,
      orgId,
      {
        entry_date: input.payment_date,
        description: `Payout of profit distribution ${dist.id.slice(0, 8)}`,
        kind: 'standard',
        source: 'distribution_payout',
        lines,
      },
      requestId
    );

    const paid: ProfitDistributionDto = { ...dist, status: 'paid' };
    await this.store.updateDistribution(user, orgId, paid);
    return paid;
  }

  async listCompensationArrangements(
    user: AuthUser,
    orgId: string
  ): Promise<CompensationArrangementDto[]> {
    await this.ctx.requirePermission(user, orgId, 'reports:read');
    return this.store.listCompensationArrangements(user, orgId);
  }

  async createCompensationArrangement(
    user: AuthUser,
    orgId: string,
    input: CreateCompensationArrangementRequest
  ): Promise<CompensationArrangementDto> {
    await this.ctx.requirePermission(user, orgId, 'members:write');
    const arr: CompensationArrangementDto = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      party_id: input.party_id,
      effective_from: input.effective_from,
      fixed_salary_minor: input.fixed_salary_minor,
      commission_bps: input.commission_bps,
      currency: input.currency,
    };
    await this.store.saveCompensationArrangement(user, orgId, arr);
    return arr;
  }

  async listSalaryRuns(user: AuthUser, orgId: string): Promise<SalaryRunDto[]> {
    await this.ctx.requirePermission(user, orgId, 'reports:read');
    return this.store.listSalaryRuns(user, orgId);
  }

  /**
   * BR-014 / FT-26: Two-step salary: accrue (Dr Salary Expense, Cr Salaries Payable), then pay.
   */
  async accrueSalaryRun(
    user: AuthUser,
    orgId: string,
    input: AccrueSalaryRequest,
    requestId: string
  ): Promise<SalaryRunDto> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    const entry = await this.ledger.createAndPostEntry(
      user,
      orgId,
      {
        entry_date: input.accrual_date,
        description: input.description,
        kind: 'standard',
        source: 'salary_accrual',
        lines: [
          {
            account_id: input.salary_expense_account_id,
            side: 'debit',
            amount_minor: input.amount_minor,
            currency: input.currency,
            party_id: input.party_id,
          },
          {
            account_id: input.salaries_payable_account_id,
            side: 'credit',
            amount_minor: input.amount_minor,
            currency: input.currency,
            party_id: input.party_id,
          },
        ],
      },
      requestId
    );
    const run: SalaryRunDto = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      party_id: input.party_id,
      accrual_date: input.accrual_date,
      amount_minor: input.amount_minor,
      currency: input.currency,
      accrual_entry_id: entry.id,
      payment_entry_id: null,
      status: 'accrued',
    };
    await this.store.saveSalaryRun(user, orgId, run);
    return run;
  }

  async paySalaryRun(
    user: AuthUser,
    orgId: string,
    runId: string,
    input: PaySalaryRunRequest,
    requestId: string
  ): Promise<SalaryRunDto> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    const run = await this.store.getSalaryRun(user, orgId, runId);
    if (!run) throw new ApiDomainError(404, 'Salary run not found');
    if (run.status === 'paid') throw new ApiDomainError(409, 'Salary run already paid');

    const payEntry = await this.ledger.createAndPostEntry(
      user,
      orgId,
      {
        entry_date: input.payment_date,
        description: `Salary payment for accrual ${run.accrual_date}`,
        kind: 'standard',
        source: 'salary_payment',
        lines: [
          {
            account_id: input.salaries_payable_account_id,
            side: 'debit',
            amount_minor: run.amount_minor,
            currency: run.currency,
            party_id: run.party_id,
          },
          {
            account_id: input.bank_account_id,
            side: 'credit',
            amount_minor: run.amount_minor,
            currency: run.currency,
            party_id: run.party_id,
          },
        ],
      },
      requestId
    );

    const updated: SalaryRunDto = {
      ...run,
      payment_entry_id: payEntry.id,
      status: 'paid',
    };
    await this.store.updateSalaryRun(user, orgId, updated);
    return updated;
  }

  async listAssets(user: AuthUser, orgId: string): Promise<AssetDto[]> {
    await this.ctx.requirePermission(user, orgId, 'reports:read');
    return this.store.listAssets(user, orgId);
  }

  async createAsset(
    user: AuthUser,
    orgId: string,
    input: CreateAssetRequest,
    requestId: string
  ): Promise<AssetDto> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    const accounts = await this.ledger.listAccounts(user, orgId);
    const assetAcc = accounts.find((a) => a.id === input.asset_account_id);
    if (!assetAcc || assetAcc.account_type !== 'asset') {
      throw new ApiDomainError(422, 'Fixed asset purchase must debit an Asset account, never Expense');
    }

    const entry = await this.ledger.createAndPostEntry(
      user,
      orgId,
      {
        entry_date: input.purchase_date,
        description: `Asset capitalization: ${input.name}`,
        kind: 'standard',
        source: 'asset_purchase',
        lines: [
          {
            account_id: input.asset_account_id,
            side: 'debit',
            amount_minor: input.purchase_cost_minor,
            currency: input.currency,
            party_id: input.assigned_party_id ?? null,
          },
          {
            account_id: input.payment_account_id,
            side: 'credit',
            amount_minor: input.purchase_cost_minor,
            currency: input.currency,
          },
        ],
      },
      requestId
    );

    const asset: AssetDto = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      name: input.name,
      category: input.category,
      purchase_date: input.purchase_date,
      purchase_cost_minor: input.purchase_cost_minor,
      book_value_minor: input.purchase_cost_minor,
      currency: input.currency,
      assigned_party_id: input.assigned_party_id ?? null,
      location: input.location ?? null,
      status: 'active',
      ledger_entry_id: entry.id,
    };
    await this.store.saveAsset(user, orgId, asset);
    return asset;
  }

  async listLiabilities(user: AuthUser, orgId: string): Promise<LiabilityDto[]> {
    await this.ctx.requirePermission(user, orgId, 'reports:read');
    return this.store.listLiabilities(user, orgId);
  }

  async createLiability(
    user: AuthUser,
    orgId: string,
    input: CreateLiabilityRequest,
    requestId: string
  ): Promise<LiabilityDto> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    const entry = await this.ledger.createAndPostEntry(
      user,
      orgId,
      {
        entry_date: input.origination_date,
        description: `Loan origination: ${input.lender_name}`,
        kind: 'loan_proceeds',
        source: 'liability_origination',
        lines: [
          {
            account_id: input.bank_account_id,
            side: 'debit',
            amount_minor: input.principal_minor,
            currency: input.currency,
            party_id: input.party_id ?? null,
          },
          {
            account_id: input.liability_account_id,
            side: 'credit',
            amount_minor: input.principal_minor,
            currency: input.currency,
            party_id: input.party_id ?? null,
          },
        ],
      },
      requestId
    );

    const liability: LiabilityDto = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      lender_name: input.lender_name,
      origination_date: input.origination_date,
      principal_minor: input.principal_minor,
      outstanding_minor: input.principal_minor,
      currency: input.currency,
      status: 'open',
      ledger_entry_id: entry.id,
    };
    await this.store.saveLiability(user, orgId, liability);
    return liability;
  }

  /**
   * ACCOUNTING_MODEL §3 / FT-33: Standalone eBay payout reconciliation posting.
   */
  async recordEbayPayout(
    user: AuthUser,
    orgId: string,
    input: RecordEbayPayoutRequest,
    requestId: string
  ): Promise<{ payout_entry: JournalEntryDto; settlement_entry: JournalEntryDto | null }> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    const gross = BigInt(input.gross_sales_minor);
    const fees = BigInt(input.marketplace_fees_minor);
    const shipping = BigInt(input.shipping_expense_minor);
    const refunds = BigInt(input.refunds_minor);
    const netClearing = gross - fees - shipping - refunds;
    if (netClearing <= 0n) {
      throw new ApiDomainError(422, 'Net eBay payout must be positive');
    }

    const lines = [
      {
        account_id: input.clearing_account_id,
        side: 'debit' as const,
        amount_minor: netClearing.toString(),
        currency: input.currency,
      },
      ...(fees > 0n
        ? [{ account_id: input.fees_account_id, side: 'debit' as const, amount_minor: fees.toString(), currency: input.currency }]
        : []),
      ...(shipping > 0n
        ? [{
            account_id: input.shipping_account_id ?? (() => { throw new ApiDomainError(422, 'shipping_account_id required'); })(),
            side: 'debit' as const,
            amount_minor: shipping.toString(),
            currency: input.currency,
          }]
        : []),
      ...(refunds > 0n
        ? [{
            account_id: input.refunds_account_id ?? (() => { throw new ApiDomainError(422, 'refunds_account_id required'); })(),
            side: 'debit' as const,
            amount_minor: refunds.toString(),
            currency: input.currency,
          }]
        : []),
      {
        account_id: input.sales_account_id,
        side: 'credit' as const,
        amount_minor: gross.toString(),
        currency: input.currency,
      },
    ];

    const payoutEntry = await this.ledger.createAndPostEntry(
      user,
      orgId,
      {
        entry_date: input.payout_date,
        description: `eBay Payout ${input.payout_ref}`,
        kind: 'standard',
        source: 'ebay_payout',
        external_id: input.payout_ref,
        lines,
      },
      requestId
    );

    let settlementEntry: JournalEntryDto | null = null;
    if (input.bank_account_id) {
      settlementEntry = await this.ledger.createAndPostEntry(
        user,
        orgId,
        {
          entry_date: input.payout_date,
          description: `eBay Bank Deposit ${input.payout_ref}`,
          kind: 'transfer',
          source: 'ebay_settlement',
          lines: [
            {
              account_id: input.bank_account_id,
              side: 'debit',
              amount_minor: netClearing.toString(),
              currency: input.currency,
            },
            {
              account_id: input.clearing_account_id,
              side: 'credit',
              amount_minor: netClearing.toString(),
              currency: input.currency,
            },
          ],
        },
        requestId
      );
    }

    return { payout_entry: payoutEntry, settlement_entry: settlementEntry };
  }
}
