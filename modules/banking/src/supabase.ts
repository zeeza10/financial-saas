import {
  ApiDomainError,
  type AuthUser,
  type BankAccountDto,
  type BankTransactionDto,
  type CreateBankAccountRequest,
  type MatchReconciliationRequest,
  type ReconciliationDto,
  type StartReconciliationRequest,
} from '@financial-saas/contracts';
import type { BankingStore } from './index.js';

export interface SupabaseBankingConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

export class SupabaseBankingStore implements BankingStore {
  constructor(private readonly cfg: SupabaseBankingConfig) {}

  private async rest<T>(user: AuthUser, path: string, init?: RequestInit): Promise<T> {
    const base = this.cfg.SUPABASE_URL.replace(/\/$/, '');
    const headers = new Headers(init?.headers);
    headers.set('apikey', this.cfg.SUPABASE_ANON_KEY);
    headers.set('Authorization', `Bearer ${user.accessToken}`);
    headers.set('Content-Type', 'application/json');
    const res = await fetch(`${base}/rest/v1/${path}`, { ...init, headers });
    if (!res.ok) {
      if (res.status === 404) throw new ApiDomainError(404, 'Resource not found');
      if (res.status === 409) throw new ApiDomainError(409, 'Conflict');
      throw new ApiDomainError(422, 'Banking database operation rejected');
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async listBankAccounts(user: AuthUser, orgId: string): Promise<BankAccountDto[]> {
    const rows = await this.rest<BankAccountDto[]>(
      user,
      `bank_accounts?select=*&organization_id=eq.${encodeURIComponent(orgId)}&order=created_at.asc`
    );
    return rows.map((r) => ({
      ...r,
      opening_balance_minor: String(r.opening_balance_minor),
      current_balance_minor: String(r.opening_balance_minor),
    }));
  }

  async createBankAccount(
    user: AuthUser,
    orgId: string,
    input: CreateBankAccountRequest
  ): Promise<BankAccountDto> {
    const rows = await this.rest<BankAccountDto[]>(user, 'bank_accounts', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        organization_id: orgId,
        account_id: input.account_id,
        institution: input.institution,
        last4: input.last4,
        ownership_type: input.ownership_type,
        opening_balance_minor: input.opening_balance_minor,
        currency: input.currency,
      }),
    });
    if (!rows[0]) throw new ApiDomainError(500, 'Failed to create bank account');
    return {
      ...rows[0],
      opening_balance_minor: String(rows[0].opening_balance_minor),
      current_balance_minor: String(rows[0].opening_balance_minor),
    };
  }

  async getBankAccount(user: AuthUser, orgId: string, bankAccountId: string): Promise<BankAccountDto | null> {
    const all = await this.listBankAccounts(user, orgId);
    return all.find((b) => b.id === bankAccountId) ?? null;
  }

  async listBankTransactions(
    user: AuthUser,
    orgId: string,
    bankAccountId?: string
  ): Promise<BankTransactionDto[]> {
    const filter = bankAccountId
      ? `&bank_account_id=eq.${encodeURIComponent(bankAccountId)}`
      : '';
    const rows = await this.rest<BankTransactionDto[]>(
      user,
      `bank_transactions?select=*&organization_id=eq.${encodeURIComponent(orgId)}${filter}&order=tx_date.asc`
    );
    return rows.map((r) => ({ ...r, amount_minor: String(r.amount_minor) }));
  }

  async getBankTransaction(
    user: AuthUser,
    orgId: string,
    txId: string
  ): Promise<BankTransactionDto | null> {
    const rows = await this.listBankTransactions(user, orgId);
    return rows.find((t) => t.id === txId) ?? null;
  }

  async insertBankTransactions(
    user: AuthUser,
    _orgId: string,
    rows: BankTransactionDto[]
  ): Promise<void> {
    if (rows.length === 0) return;
    await this.rest(user, 'bank_transactions', {
      method: 'POST',
      body: JSON.stringify(
        rows.map((r) => ({
          id: r.id,
          organization_id: r.organization_id,
          bank_account_id: r.bank_account_id,
          tx_date: r.tx_date,
          amount_minor: r.amount_minor,
          currency: r.currency,
          description: r.description,
          source: r.source,
          external_id: r.external_id,
          fingerprint: r.fingerprint,
          status: r.status,
        }))
      ),
    });
  }

  async markBankTransactionPosted(
    user: AuthUser,
    orgId: string,
    txId: string,
    entryId: string
  ): Promise<BankTransactionDto> {
    const rows = await this.rest<BankTransactionDto[]>(
      user,
      `bank_transactions?organization_id=eq.${encodeURIComponent(orgId)}&id=eq.${encodeURIComponent(txId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ status: 'posted', linked_entry_id: entryId }),
      }
    );
    if (!rows[0]) throw new ApiDomainError(404, 'Bank transaction not found');
    return { ...rows[0], amount_minor: String(rows[0].amount_minor) };
  }

  async listReconciliations(user: AuthUser, orgId: string): Promise<ReconciliationDto[]> {
    const rows = await this.rest<
      Array<{
        id: string;
        organization_id: string;
        bank_account_id: string;
        statement_date: string;
        statement_ending_balance_minor: string | number;
        status: 'in_progress' | 'completed';
        locked_at: string | null;
        reconciliation_matches: Array<{
          id: string;
          bank_transaction_id: string;
          journal_entry_id: string;
        }>;
      }>
    >(
      user,
      `reconciliations?select=*,reconciliation_matches(id,bank_transaction_id,journal_entry_id)&organization_id=eq.${encodeURIComponent(orgId)}`
    );
    return rows.map((r) => ({
      id: r.id,
      organization_id: r.organization_id,
      bank_account_id: r.bank_account_id,
      statement_date: r.statement_date,
      statement_ending_balance_minor: String(r.statement_ending_balance_minor),
      matched_total_minor: '0',
      difference_minor: '0',
      status: r.status,
      locked_at: r.locked_at,
      matches: r.reconciliation_matches ?? [],
    }));
  }

  async createReconciliation(
    user: AuthUser,
    orgId: string,
    input: StartReconciliationRequest
  ): Promise<ReconciliationDto> {
    const rows = await this.rest<Array<{ id: string }>>(user, 'reconciliations', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        organization_id: orgId,
        bank_account_id: input.bank_account_id,
        statement_date: input.statement_date,
        statement_ending_balance_minor: input.statement_ending_balance_minor,
      }),
    });
    const list = await this.listReconciliations(user, orgId);
    const created = list.find((r) => r.id === rows[0]?.id);
    if (!created) throw new ApiDomainError(500, 'Failed to create reconciliation');
    return created;
  }

  async matchReconciliation(
    user: AuthUser,
    orgId: string,
    reconciliationId: string,
    input: MatchReconciliationRequest
  ): Promise<ReconciliationDto> {
    await this.rest(user, 'reconciliation_matches', {
      method: 'POST',
      body: JSON.stringify({
        organization_id: orgId,
        reconciliation_id: reconciliationId,
        bank_transaction_id: input.bank_transaction_id,
        journal_entry_id: input.journal_entry_id,
      }),
    });
    const list = await this.listReconciliations(user, orgId);
    const rec = list.find((r) => r.id === reconciliationId);
    if (!rec) throw new ApiDomainError(404, 'Reconciliation not found');
    return rec;
  }

  async completeReconciliation(
    user: AuthUser,
    orgId: string,
    reconciliationId: string
  ): Promise<ReconciliationDto> {
    await this.rest(
      user,
      `reconciliations?organization_id=eq.${encodeURIComponent(orgId)}&id=eq.${encodeURIComponent(reconciliationId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'completed', locked_at: new Date().toISOString() }),
      }
    );
    const list = await this.listReconciliations(user, orgId);
    const rec = list.find((r) => r.id === reconciliationId);
    if (!rec) throw new ApiDomainError(404, 'Reconciliation not found');
    return rec;
  }
}
