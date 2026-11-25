import {
  ApiDomainError,
  type AuthUser,
  type BankAccountDto,
  type BankTransactionDto,
  type CreateBankAccountRequest,
  type CreateTransferRequest,
  type ImportCsvTransactionsRequest,
  type JournalEntryDto,
  type MatchReconciliationRequest,
  type PlatformContext,
  type PostBankTransactionRequest,
  type ReconciliationDto,
  type StartReconciliationRequest,
} from '@financial-saas/contracts';
import {
  computeTransactionFingerprint,
  parseBankStatementCsv,
} from '@financial-saas/ledger-core';
import type { LedgerModule } from '@financial-saas/ledger';

export { SupabaseBankingStore, type SupabaseBankingConfig } from './supabase.js';

export interface BankingStore {
  listBankAccounts(user: AuthUser, orgId: string): Promise<BankAccountDto[]>;
  createBankAccount(
    user: AuthUser,
    orgId: string,
    input: CreateBankAccountRequest
  ): Promise<BankAccountDto>;
  getBankAccount(user: AuthUser, orgId: string, bankAccountId: string): Promise<BankAccountDto | null>;
  listBankTransactions(
    user: AuthUser,
    orgId: string,
    bankAccountId?: string
  ): Promise<BankTransactionDto[]>;
  getBankTransaction(user: AuthUser, orgId: string, txId: string): Promise<BankTransactionDto | null>;
  insertBankTransactions(
    user: AuthUser,
    orgId: string,
    rows: BankTransactionDto[]
  ): Promise<void>;
  markBankTransactionPosted(
    user: AuthUser,
    orgId: string,
    txId: string,
    entryId: string
  ): Promise<BankTransactionDto>;
  listReconciliations(user: AuthUser, orgId: string): Promise<ReconciliationDto[]>;
  createReconciliation(
    user: AuthUser,
    orgId: string,
    input: StartReconciliationRequest
  ): Promise<ReconciliationDto>;
  matchReconciliation(
    user: AuthUser,
    orgId: string,
    reconciliationId: string,
    input: MatchReconciliationRequest
  ): Promise<ReconciliationDto>;
  completeReconciliation(
    user: AuthUser,
    orgId: string,
    reconciliationId: string
  ): Promise<ReconciliationDto>;
}

/**
 * In-memory BankingStore implementing BR-006 (business vs personal, last4 only),
 * BR-013 (duplicate protection), and BR-020 (1:1 locked reconciliation).
 */
export class InMemoryBankingStore implements BankingStore {
  private readonly bankAccounts = new Map<string, BankAccountDto>();
  private readonly bankTxs = new Map<string, BankTransactionDto>();
  private readonly reconciliations = new Map<string, ReconciliationDto>();

  constructor(private readonly ledger: LedgerModule) {}

  async listBankAccounts(user: AuthUser, orgId: string): Promise<BankAccountDto[]> {
    const entries = await this.ledger.listJournalEntries(user, orgId).catch(() => [] as JournalEntryDto[]);
    const list = Array.from(this.bankAccounts.values()).filter((b) => b.organization_id === orgId);

    return list.map((b) => {
      let balance = BigInt(b.opening_balance_minor);
      for (const e of entries) {
        if (e.status !== 'posted') continue;
        for (const l of e.lines) {
          if (l.account_id === b.account_id) {
            const amt = BigInt(l.amount_minor);
            balance += l.side === 'debit' ? amt : -amt;
          }
        }
      }
      return { ...b, current_balance_minor: balance.toString() };
    });
  }

  async createBankAccount(
    user: AuthUser,
    orgId: string,
    input: CreateBankAccountRequest
  ): Promise<BankAccountDto> {
    const ledgerAccounts = await this.ledger.listAccounts(user, orgId);
    const linked = ledgerAccounts.find((a) => a.id === input.account_id);
    if (!linked) {
      throw new ApiDomainError(404, 'Linked ledger account not found');
    }
    if (linked.ownership_type !== input.ownership_type) {
      throw new ApiDomainError(
        422,
        `BR-006: Bank account ownership_type (${input.ownership_type}) must match ledger account (${linked.ownership_type})`
      );
    }
    const existing = Array.from(this.bankAccounts.values()).find(
      (b) => b.organization_id === orgId && b.account_id === input.account_id
    );
    if (existing) {
      throw new ApiDomainError(409, 'Ledger account is already linked to a bank account');
    }

    const ba: BankAccountDto = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      account_id: input.account_id,
      institution: input.institution,
      last4: input.last4,
      ownership_type: input.ownership_type,
      opening_balance_minor: input.opening_balance_minor,
      current_balance_minor: input.opening_balance_minor,
      currency: input.currency,
      is_active: true,
      created_at: new Date().toISOString(),
    };
    this.bankAccounts.set(ba.id, ba);
    return ba;
  }

  async getBankAccount(user: AuthUser, orgId: string, bankAccountId: string): Promise<BankAccountDto | null> {
    const all = await this.listBankAccounts(user, orgId);
    return all.find((b) => b.id === bankAccountId) ?? null;
  }

  async listBankTransactions(
    _user: AuthUser,
    orgId: string,
    bankAccountId?: string
  ): Promise<BankTransactionDto[]> {
    return Array.from(this.bankTxs.values())
      .filter(
        (t) =>
          t.organization_id === orgId &&
          (bankAccountId === undefined || t.bank_account_id === bankAccountId)
      )
      .sort((a, b) => a.tx_date.localeCompare(b.tx_date));
  }

  async getBankTransaction(
    _user: AuthUser,
    orgId: string,
    txId: string
  ): Promise<BankTransactionDto | null> {
    const tx = this.bankTxs.get(txId);
    if (!tx || tx.organization_id !== orgId) return null;
    return { ...tx };
  }

  async insertBankTransactions(
    _user: AuthUser,
    orgId: string,
    rows: BankTransactionDto[]
  ): Promise<void> {
    for (const r of rows) {
      if (r.external_id) {
        const dup = Array.from(this.bankTxs.values()).find(
          (t) =>
            t.organization_id === orgId &&
            t.source === r.source &&
            t.external_id === r.external_id
        );
        if (dup) {
          throw new ApiDomainError(409, `FT-15/BR-013: Duplicate external_id "${r.external_id}"`);
        }
      }
    }
    for (const r of rows) {
      this.bankTxs.set(r.id, r);
    }
  }

  async markBankTransactionPosted(
    _user: AuthUser,
    orgId: string,
    txId: string,
    entryId: string
  ): Promise<BankTransactionDto> {
    const tx = this.bankTxs.get(txId);
    if (!tx || tx.organization_id !== orgId) {
      throw new ApiDomainError(404, 'Bank transaction not found');
    }
    const updated: BankTransactionDto = {
      ...tx,
      status: 'posted',
      linked_entry_id: entryId,
    };
    this.bankTxs.set(txId, updated);
    return updated;
  }

  async listReconciliations(_user: AuthUser, orgId: string): Promise<ReconciliationDto[]> {
    return Array.from(this.reconciliations.values()).filter((r) => r.organization_id === orgId);
  }

  async createReconciliation(
    user: AuthUser,
    orgId: string,
    input: StartReconciliationRequest
  ): Promise<ReconciliationDto> {
    const ba = await this.getBankAccount(user, orgId, input.bank_account_id);
    if (!ba) {
      throw new ApiDomainError(404, 'Bank account not found');
    }
    const rec: ReconciliationDto = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      bank_account_id: input.bank_account_id,
      statement_date: input.statement_date,
      statement_ending_balance_minor: input.statement_ending_balance_minor,
      matched_total_minor: ba.opening_balance_minor,
      difference_minor: (
        BigInt(input.statement_ending_balance_minor) - BigInt(ba.opening_balance_minor)
      ).toString(),
      status: 'in_progress',
      locked_at: null,
      matches: [],
    };
    this.reconciliations.set(rec.id, rec);
    return rec;
  }

  async matchReconciliation(
    user: AuthUser,
    orgId: string,
    reconciliationId: string,
    input: MatchReconciliationRequest
  ): Promise<ReconciliationDto> {
    const rec = this.reconciliations.get(reconciliationId);
    if (!rec || rec.organization_id !== orgId) {
      throw new ApiDomainError(404, 'Reconciliation not found');
    }
    if (rec.status === 'completed') {
      throw new ApiDomainError(409, 'BR-020: Reconciliation is locked');
    }

    const tx = this.bankTxs.get(input.bank_transaction_id);
    if (!tx || tx.organization_id !== orgId || tx.bank_account_id !== rec.bank_account_id) {
      throw new ApiDomainError(404, 'Bank transaction not found for this bank account');
    }

    const allRecs = Array.from(this.reconciliations.values()).filter(
      (r) => r.organization_id === orgId
    );
    for (const other of allRecs) {
      if (other.matches.some((m) => m.bank_transaction_id === input.bank_transaction_id)) {
        throw new ApiDomainError(409, 'FT-27/BR-020: Bank transaction is already matched');
      }
      if (other.matches.some((m) => m.journal_entry_id === input.journal_entry_id)) {
        throw new ApiDomainError(409, 'FT-27/BR-020: Journal entry is already matched');
      }
    }

    const entries = await this.ledger.listJournalEntries(user, orgId);
    const entry = entries.find((e) => e.id === input.journal_entry_id && e.status === 'posted');
    if (!entry) {
      throw new ApiDomainError(404, 'Posted journal entry not found');
    }

    rec.matches.push({
      id: crypto.randomUUID(),
      bank_transaction_id: input.bank_transaction_id,
      journal_entry_id: input.journal_entry_id,
    });
    this.bankTxs.set(tx.id, { ...tx, status: 'reconciled' });

    const matchedSum = BigInt(rec.matched_total_minor) + BigInt(tx.amount_minor);
    const diff = BigInt(rec.statement_ending_balance_minor) - matchedSum;
    const updated: ReconciliationDto = {
      ...rec,
      matched_total_minor: matchedSum.toString(),
      difference_minor: diff.toString(),
    };
    this.reconciliations.set(rec.id, updated);
    return updated;
  }

  async completeReconciliation(
    _user: AuthUser,
    orgId: string,
    reconciliationId: string
  ): Promise<ReconciliationDto> {
    const rec = this.reconciliations.get(reconciliationId);
    if (!rec || rec.organization_id !== orgId) {
      throw new ApiDomainError(404, 'Reconciliation not found');
    }
    if (rec.difference_minor !== '0') {
      throw new ApiDomainError(422, 'F6: Reconciliation difference must be 0 to complete');
    }
    const completed: ReconciliationDto = {
      ...rec,
      status: 'completed',
      locked_at: new Date().toISOString(),
    };
    this.reconciliations.set(rec.id, completed);
    return completed;
  }
}

/**
 * Public interface of modules/banking (MODULE_ARCHITECTURE.md).
 * Requests ledger writes exclusively through LedgerModule.
 */
export class BankingModule {
  constructor(
    private readonly ctx: PlatformContext,
    private readonly ledger: LedgerModule,
    private readonly store: BankingStore
  ) {}

  async listBankAccounts(user: AuthUser, orgId: string): Promise<BankAccountDto[]> {
    await this.ctx.requirePermission(user, orgId, 'banking:read');
    return this.store.listBankAccounts(user, orgId);
  }

  async createBankAccount(
    user: AuthUser,
    orgId: string,
    input: CreateBankAccountRequest,
    requestId: string
  ): Promise<BankAccountDto> {
    await this.ctx.requirePermission(user, orgId, 'banking:write');
    const ba = await this.store.createBankAccount(user, orgId, input);
    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'bank_account.created',
      entityType: 'bank_account',
      entityId: ba.id,
      payload: { institution: ba.institution, last4: ba.last4, ownership_type: ba.ownership_type },
      requestId,
    });
    return ba;
  }

  /**
   * BR-005 / FT-06 / FT-07: Internal transfer posts Dr destination, Cr source (kind='transfer').
   * Any transfer fee is posted as a separate expense entry so transfer lines never hit income/expense.
   */
  async createTransfer(
    user: AuthUser,
    orgId: string,
    input: CreateTransferRequest,
    requestId: string
  ): Promise<{ transfer_entry: JournalEntryDto; fee_entry: JournalEntryDto | null }> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    if (input.from_account_id === input.to_account_id) {
      throw new ApiDomainError(422, 'Source and destination accounts must differ');
    }

    const transferEntry = await this.ledger.createAndPostEntry(
      user,
      orgId,
      {
        entry_date: input.transfer_date,
        description: input.description,
        kind: 'transfer',
        source: 'transfer',
        lines: [
          {
            account_id: input.to_account_id,
            side: 'debit',
            amount_minor: input.amount_minor,
            currency: input.currency,
          },
          {
            account_id: input.from_account_id,
            side: 'credit',
            amount_minor: input.amount_minor,
            currency: input.currency,
          },
        ],
      },
      requestId
    );

    let feeEntry: JournalEntryDto | null = null;
    if (BigInt(input.fee_amount_minor) > 0n) {
      if (!input.fee_account_id) {
        throw new ApiDomainError(422, 'BR-005: fee_account_id is required when fee_amount_minor > 0');
      }
      feeEntry = await this.ledger.createAndPostEntry(
        user,
        orgId,
        {
          entry_date: input.transfer_date,
          description: `Transfer fee: ${input.description}`,
          kind: 'standard',
          source: 'transfer_fee',
          lines: [
            {
              account_id: input.fee_account_id,
              side: 'debit',
              amount_minor: input.fee_amount_minor,
              currency: input.currency,
            },
            {
              account_id: input.from_account_id,
              side: 'credit',
              amount_minor: input.fee_amount_minor,
              currency: input.currency,
            },
          ],
        },
        requestId
      );
    }

    return { transfer_entry: transferEntry, fee_entry: feeEntry };
  }

  async listBankTransactions(
    user: AuthUser,
    orgId: string,
    bankAccountId?: string
  ): Promise<BankTransactionDto[]> {
    await this.ctx.requirePermission(user, orgId, 'banking:read');
    return this.store.listBankTransactions(user, orgId, bankAccountId);
  }

  async importCsvTransactions(
    user: AuthUser,
    orgId: string,
    input: ImportCsvTransactionsRequest,
    requestId: string
  ): Promise<{ imported: number; duplicate_held: number; transactions: BankTransactionDto[] }> {
    await this.ctx.requirePermission(user, orgId, 'transactions:import');
    const ba = await this.store.getBankAccount(user, orgId, input.bank_account_id);
    if (!ba) {
      throw new ApiDomainError(404, 'Bank account not found');
    }

    const parsed = parseBankStatementCsv(input.csv_text, ba.currency);
    if (parsed.errors.length > 0) {
      throw new ApiDomainError(
        422,
        'CSV import validation failed; no partial import performed',
        JSON.stringify(parsed.errors)
      );
    }

    const existingTxs = await this.store.listBankTransactions(user, orgId, ba.id);
    const existingFingerprints = new Set(existingTxs.map((t) => t.fingerprint));

    const toInsert: BankTransactionDto[] = [];
    let duplicateHeldCount = 0;

    for (const row of parsed.rows) {
      const fingerprint = await computeTransactionFingerprint({
        accountId: ba.id,
        isoDate: row.txDate,
        amountMinor: row.amountMinor,
        description: row.description,
      });

      let status: BankTransactionDto['status'] = 'ready';
      if (!row.externalId && existingFingerprints.has(fingerprint)) {
        status = 'duplicate_held';
        duplicateHeldCount += 1;
      } else if (!row.externalId) {
        existingFingerprints.add(fingerprint);
      }

      toInsert.push({
        id: crypto.randomUUID(),
        organization_id: orgId,
        bank_account_id: ba.id,
        tx_date: row.txDate,
        amount_minor: row.amountMinor.toString(),
        currency: ba.currency,
        description: row.description,
        source: input.source,
        external_id: row.externalId,
        fingerprint,
        status,
        linked_entry_id: null,
        created_at: new Date().toISOString(),
      });
    }

    await this.store.insertBankTransactions(user, orgId, toInsert);

    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'transactions.csv_imported',
      entityType: 'bank_account',
      entityId: ba.id,
      payload: { imported: toInsert.length, duplicate_held: duplicateHeldCount },
      requestId,
    });

    return {
      imported: toInsert.length,
      duplicate_held: duplicateHeldCount,
      transactions: toInsert,
    };
  }

  async postBankTransaction(
    user: AuthUser,
    orgId: string,
    txId: string,
    input: PostBankTransactionRequest,
    requestId: string
  ): Promise<{ transaction: BankTransactionDto; entry: JournalEntryDto }> {
    await this.ctx.requirePermission(user, orgId, 'ledger:post');
    const tx = await this.store.getBankTransaction(user, orgId, txId);
    if (!tx) {
      throw new ApiDomainError(404, 'Bank transaction not found');
    }
    if (tx.status === 'posted' || tx.status === 'reconciled') {
      throw new ApiDomainError(409, 'Bank transaction is already posted');
    }
    if (tx.status === 'duplicate_held') {
      throw new ApiDomainError(409, 'BR-013: Duplicate-held transaction requires manual review');
    }

    const ba = await this.store.getBankAccount(user, orgId, tx.bank_account_id);
    if (!ba) {
      throw new ApiDomainError(404, 'Bank account not found');
    }

    const amt = BigInt(tx.amount_minor);
    const absStr = (amt < 0n ? -amt : amt).toString();
    const isInflow = amt > 0n;

    const entry = await this.ledger.createAndPostEntry(
      user,
      orgId,
      {
        entry_date: tx.tx_date,
        description: tx.description,
        kind: input.kind,
        source: tx.source,
        external_id: tx.external_id,
        lines: [
          {
            account_id: ba.account_id,
            side: isInflow ? 'debit' : 'credit',
            amount_minor: absStr,
            currency: tx.currency,
            party_id: input.party_id ?? null,
          },
          {
            account_id: input.offset_account_id,
            side: isInflow ? 'credit' : 'debit',
            amount_minor: absStr,
            currency: tx.currency,
            party_id: input.party_id ?? null,
          },
        ],
      },
      requestId
    );

    const updatedTx = await this.store.markBankTransactionPosted(user, orgId, txId, entry.id);
    return { transaction: updatedTx, entry };
  }

  async listReconciliations(user: AuthUser, orgId: string): Promise<ReconciliationDto[]> {
    await this.ctx.requirePermission(user, orgId, 'banking:read');
    return this.store.listReconciliations(user, orgId);
  }

  async startReconciliation(
    user: AuthUser,
    orgId: string,
    input: StartReconciliationRequest,
    requestId: string
  ): Promise<ReconciliationDto> {
    await this.ctx.requirePermission(user, orgId, 'banking:write');
    const rec = await this.store.createReconciliation(user, orgId, input);
    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'reconciliation.started',
      entityType: 'reconciliation',
      entityId: rec.id,
      payload: { bank_account_id: input.bank_account_id, statement_date: input.statement_date },
      requestId,
    });
    return rec;
  }

  async matchReconciliation(
    user: AuthUser,
    orgId: string,
    reconciliationId: string,
    input: MatchReconciliationRequest
  ): Promise<ReconciliationDto> {
    await this.ctx.requirePermission(user, orgId, 'banking:write');
    return this.store.matchReconciliation(user, orgId, reconciliationId, input);
  }

  async completeReconciliation(
    user: AuthUser,
    orgId: string,
    reconciliationId: string,
    requestId: string
  ): Promise<ReconciliationDto> {
    await this.ctx.requirePermission(user, orgId, 'banking:write');
    const rec = await this.store.completeReconciliation(user, orgId, reconciliationId);
    await this.ctx.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'reconciliation.completed',
      entityType: 'reconciliation',
      entityId: rec.id,
      payload: { statement_date: rec.statement_date },
      requestId,
    });
    return rec;
  }
}
