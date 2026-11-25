import {
  ApiDomainError,
  type AccountDto,
  type AuthUser,
  type CreateAccountRequest,
  type CreateJournalDraftRequest,
  type CreatePeriodRequest,
  type JournalEntryDto,
  type PeriodDto,
  type ReverseJournalEntryRequest,
} from '@financial-saas/contracts';
import { DEFAULT_COA_TEMPLATE } from '@financial-saas/ledger-core';
import type { LedgerStore } from './index.js';

export interface SupabaseConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

/**
 * PostgREST/RPC LedgerStore executing strictly with the user's JWT (ADR-0003).
 */
export class SupabaseLedgerStore implements LedgerStore {
  constructor(private readonly cfg: SupabaseConfig) {}

  private async rest<T>(user: AuthUser, path: string, init?: RequestInit): Promise<T> {
    const base = this.cfg.SUPABASE_URL.replace(/\/$/, '');
    const headers = new Headers(init?.headers);
    headers.set('apikey', this.cfg.SUPABASE_ANON_KEY);
    headers.set('Authorization', `Bearer ${user.accessToken}`);
    headers.set('Content-Type', 'application/json');

    const res = await fetch(`${base}/rest/v1/${path}`, { ...init, headers });
    if (!res.ok) {
      if (res.status === 404) throw new ApiDomainError(404, 'Resource not found');
      if (res.status === 403) throw new ApiDomainError(403, 'Forbidden');
      if (res.status === 409) throw new ApiDomainError(409, 'Conflict');
      throw new ApiDomainError(422, 'Ledger database operation rejected');
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async listAccounts(user: AuthUser, orgId: string): Promise<AccountDto[]> {
    return this.rest<AccountDto[]>(
      user,
      `accounts?select=*&organization_id=eq.${encodeURIComponent(orgId)}&order=code.asc`
    );
  }

  async createAccount(
    user: AuthUser,
    orgId: string,
    input: CreateAccountRequest & { is_system?: boolean }
  ): Promise<AccountDto> {
    const rows = await this.rest<AccountDto[]>(user, 'accounts', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        organization_id: orgId,
        code: input.code,
        name: input.name,
        account_type: input.account_type,
        ownership_type: input.ownership_type ?? 'business',
        is_system: input.is_system ?? false,
        parent_id: input.parent_id ?? null,
      }),
    });
    if (!rows[0]) throw new ApiDomainError(500, 'Failed to create account');
    return rows[0];
  }

  async seedDefaultCoa(user: AuthUser, orgId: string): Promise<AccountDto[]> {
    const existing = await this.listAccounts(user, orgId);
    const existingCodes = new Set(existing.map((a) => a.code));
    const missing = DEFAULT_COA_TEMPLATE.filter((t) => !existingCodes.has(t.code)).map((t) => ({
      organization_id: orgId,
      code: t.code,
      name: t.name,
      account_type: t.account_type,
      ownership_type: t.ownership_type,
      is_system: t.is_system,
    }));
    if (missing.length > 0) {
      await this.rest(user, 'accounts', {
        method: 'POST',
        body: JSON.stringify(missing),
      });
    }
    return this.listAccounts(user, orgId);
  }

  async listPeriods(user: AuthUser, orgId: string): Promise<PeriodDto[]> {
    return this.rest<PeriodDto[]>(
      user,
      `accounting_periods?select=*&organization_id=eq.${encodeURIComponent(orgId)}&order=start_date.asc`
    );
  }

  async createPeriod(user: AuthUser, orgId: string, input: CreatePeriodRequest): Promise<PeriodDto> {
    const rows = await this.rest<PeriodDto[]>(user, 'accounting_periods', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        organization_id: orgId,
        name: input.name,
        start_date: input.start_date,
        end_date: input.end_date,
      }),
    });
    if (!rows[0]) throw new ApiDomainError(500, 'Failed to create period');
    return rows[0];
  }

  async closePeriod(user: AuthUser, orgId: string, periodId: string, requestId: string): Promise<PeriodDto> {
    await this.rest<string>(user, 'rpc/rpc_close_period', {
      method: 'POST',
      body: JSON.stringify({ p_org_id: orgId, p_period_id: periodId, p_request_id: requestId }),
    });
    const list = await this.listPeriods(user, orgId);
    const closed = list.find((p) => p.id === periodId);
    if (!closed) throw new ApiDomainError(404, 'Period not found');
    return closed;
  }

  async reopenPeriod(
    user: AuthUser,
    orgId: string,
    periodId: string,
    reason: string,
    requestId: string
  ): Promise<PeriodDto> {
    await this.rest<void>(user, 'rpc/rpc_reopen_period', {
      method: 'POST',
      body: JSON.stringify({
        p_org_id: orgId,
        p_period_id: periodId,
        p_reason: reason,
        p_request_id: requestId,
      }),
    });
    const list = await this.listPeriods(user, orgId);
    const reopened = list.find((p) => p.id === periodId);
    if (!reopened) throw new ApiDomainError(404, 'Period not found');
    return reopened;
  }

  async listJournalEntries(user: AuthUser, orgId: string): Promise<JournalEntryDto[]> {
    const rows = await this.rest<Array<Omit<JournalEntryDto, 'lines'> & { journal_lines: JournalEntryDto['lines'] }>>(
      user,
      `journal_entries?select=*,journal_lines(*)&organization_id=eq.${encodeURIComponent(orgId)}&order=created_at.asc`
    );
    return rows.map((r) => ({
      ...r,
      entry_no: r.entry_no !== null ? String(r.entry_no) : null,
      lines: (r.journal_lines ?? []).map((l) => ({
        ...l,
        amount_minor: String(l.amount_minor),
      })),
    }));
  }

  async createDraftEntry(
    user: AuthUser,
    orgId: string,
    input: CreateJournalDraftRequest
  ): Promise<JournalEntryDto> {
    const entries = await this.rest<Array<Omit<JournalEntryDto, 'lines'>>>(user, 'journal_entries', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        organization_id: orgId,
        entry_date: input.entry_date,
        description: input.description,
        kind: input.kind,
        status: 'draft',
        source: input.source,
        external_id: input.external_id ?? null,
        created_by: user.userId,
      }),
    });
    const entry = entries[0];
    if (!entry) throw new ApiDomainError(500, 'Failed to create draft journal entry');

    const lines = await this.rest<JournalEntryDto['lines']>(user, 'journal_lines', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify(
        input.lines.map((l, idx) => ({
          organization_id: orgId,
          entry_id: entry.id,
          line_no: idx + 1,
          account_id: l.account_id,
          party_id: l.party_id ?? null,
          side: l.side,
          amount_minor: l.amount_minor,
          currency: l.currency,
          memo: l.memo ?? null,
        }))
      ),
    });

    return {
      ...entry,
      entry_no: null,
      lines: lines.map((l) => ({ ...l, amount_minor: String(l.amount_minor) })),
    };
  }

  async postJournalEntry(
    user: AuthUser,
    orgId: string,
    entryId: string,
    requestId: string
  ): Promise<JournalEntryDto> {
    await this.rest<number>(user, 'rpc/rpc_post_journal_entry', {
      method: 'POST',
      body: JSON.stringify({ p_org_id: orgId, p_entry_id: entryId, p_request_id: requestId }),
    });
    const all = await this.listJournalEntries(user, orgId);
    const posted = all.find((e) => e.id === entryId);
    if (!posted) throw new ApiDomainError(404, 'Posted entry not found');
    return posted;
  }

  async reverseJournalEntry(
    user: AuthUser,
    orgId: string,
    entryId: string,
    input: ReverseJournalEntryRequest,
    requestId: string
  ): Promise<JournalEntryDto> {
    const revId = await this.rest<string>(user, 'rpc/rpc_reverse_journal_entry', {
      method: 'POST',
      body: JSON.stringify({
        p_org_id: orgId,
        p_entry_id: entryId,
        p_reason: input.reason,
        p_reversal_date: input.reversal_date ?? new Date().toISOString().slice(0, 10),
        p_request_id: requestId,
      }),
    });
    const all = await this.listJournalEntries(user, orgId);
    const rev = all.find((e) => e.id === revId);
    if (!rev) throw new ApiDomainError(404, 'Reversal entry not found');
    return rev;
  }
}
