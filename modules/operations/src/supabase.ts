import {
  ApiDomainError,
  type AssetDto,
  type AuthUser,
  type CompensationArrangementDto,
  type CreatePartyRequest,
  type InvoiceBillDto,
  type LiabilityDto,
  type PartyDto,
  type ProfitDistributionDto,
  type ProfitShareAgreementDto,
  type SalaryRunDto,
} from '@financial-saas/contracts';
import type { OperationsStore } from './index.js';

export interface SupabaseOpsConfig {
  SUPABASE_URL: string;
  SUPABASE_ANON_KEY: string;
}

/**
 * PostgREST/RPC OperationsStore executing strictly with user JWT (ADR-0003).
 */
export class SupabaseOperationsStore implements OperationsStore {
  constructor(private readonly cfg: SupabaseOpsConfig) {}

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
      throw new ApiDomainError(422, 'Operations database request rejected');
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async listParties(user: AuthUser, orgId: string): Promise<PartyDto[]> {
    return this.rest<PartyDto[]>(
      user,
      `parties?select=*&organization_id=eq.${encodeURIComponent(orgId)}&order=created_at.asc`
    );
  }

  async getParty(user: AuthUser, orgId: string, partyId: string): Promise<PartyDto | null> {
    const list = await this.listParties(user, orgId);
    return list.find((p) => p.id === partyId) ?? null;
  }

  async createParty(user: AuthUser, orgId: string, input: CreatePartyRequest): Promise<PartyDto> {
    const rows = await this.rest<PartyDto[]>(user, 'parties', {
      method: 'POST',
      headers: { Prefer: 'return=representation' },
      body: JSON.stringify({
        organization_id: orgId,
        party_type: input.party_type,
        display_name: input.display_name,
        email_redacted: input.email ? input.email.replace(/(^.).*(@.*$)/, '$1***$2') : null,
        shareholding_bps: input.shareholding_bps ?? 0,
      }),
    });
    if (!rows[0]) throw new ApiDomainError(500, 'Failed to create party');
    return rows[0];
  }

  async pseudonymizeParty(
    user: AuthUser,
    orgId: string,
    partyId: string,
    requestId: string
  ): Promise<PartyDto> {
    await this.rest(user, 'rpc/rpc_pseudonymize_party', {
      method: 'POST',
      body: JSON.stringify({ p_org_id: orgId, p_party_id: partyId, p_request_id: requestId }),
    });
    const p = await this.getParty(user, orgId, partyId);
    if (!p) throw new ApiDomainError(404, 'Party not found');
    return p;
  }

  async listInvoicesBills(user: AuthUser, orgId: string): Promise<InvoiceBillDto[]> {
    const rows = await this.rest<Array<Omit<InvoiceBillDto, 'remaining_minor'>>>(
      user,
      `invoices_bills?select=*&organization_id=eq.${encodeURIComponent(orgId)}`
    );
    return rows.map((r) => ({
      ...r,
      total_minor: String(r.total_minor),
      allocated_minor: String(r.allocated_minor),
      remaining_minor: (BigInt(r.total_minor) - BigInt(r.allocated_minor)).toString(),
    }));
  }

  async saveInvoiceBill(user: AuthUser, _orgId: string, doc: InvoiceBillDto): Promise<void> {
    await this.rest(user, 'invoices_bills', {
      method: 'POST',
      body: JSON.stringify({
        id: doc.id,
        organization_id: doc.organization_id,
        kind: doc.kind,
        doc_number: doc.doc_number,
        party_id: doc.party_id,
        issue_date: doc.issue_date,
        due_date: doc.due_date,
        total_minor: doc.total_minor,
        allocated_minor: doc.allocated_minor,
        currency: doc.currency,
        status: doc.status,
        ledger_entry_id: doc.ledger_entry_id,
        purpose: doc.purpose,
      }),
    });
  }

  async getInvoiceBill(user: AuthUser, orgId: string, docId: string): Promise<InvoiceBillDto | null> {
    const list = await this.listInvoicesBills(user, orgId);
    return list.find((d) => d.id === docId) ?? null;
  }

  async updateInvoiceBill(user: AuthUser, orgId: string, doc: InvoiceBillDto): Promise<void> {
    await this.rest(
      user,
      `invoices_bills?organization_id=eq.${encodeURIComponent(orgId)}&id=eq.${encodeURIComponent(doc.id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ allocated_minor: doc.allocated_minor, status: doc.status }),
      }
    );
  }

  async listAgreements(user: AuthUser, orgId: string): Promise<ProfitShareAgreementDto[]> {
    return this.rest<ProfitShareAgreementDto[]>(
      user,
      `profit_share_agreements?select=*,lines:profit_share_lines(party_id,share_bps)&organization_id=eq.${encodeURIComponent(orgId)}`
    );
  }

  async saveAgreement(user: AuthUser, _orgId: string, agreement: ProfitShareAgreementDto): Promise<void> {
    await this.rest(user, 'profit_share_agreements', {
      method: 'POST',
      body: JSON.stringify({
        id: agreement.id,
        organization_id: agreement.organization_id,
        name: agreement.name,
        effective_from: agreement.effective_from,
        effective_to: agreement.effective_to,
      }),
    });
    await this.rest(user, 'profit_share_lines', {
      method: 'POST',
      body: JSON.stringify(
        agreement.lines.map((l) => ({
          organization_id: agreement.organization_id,
          agreement_id: agreement.id,
          party_id: l.party_id,
          share_bps: l.share_bps,
        }))
      ),
    });
  }

  async listDistributions(user: AuthUser, orgId: string): Promise<ProfitDistributionDto[]> {
    return this.rest<ProfitDistributionDto[]>(
      user,
      `profit_distributions?select=*,lines:profit_distribution_lines(party_id,share_bps,amount_minor)&organization_id=eq.${encodeURIComponent(orgId)}`
    );
  }

  async saveDistribution(user: AuthUser, _orgId: string, dist: ProfitDistributionDto): Promise<void> {
    await this.rest(user, 'profit_distributions', {
      method: 'POST',
      body: JSON.stringify({
        id: dist.id,
        organization_id: dist.organization_id,
        period_id: dist.period_id,
        agreement_id: dist.agreement_id,
        net_profit_minor: dist.net_profit_minor,
        currency: dist.currency,
        ledger_entry_id: dist.ledger_entry_id,
        status: dist.status,
      }),
    });
    await this.rest(user, 'profit_distribution_lines', {
      method: 'POST',
      body: JSON.stringify(
        dist.lines.map((l) => ({
          organization_id: dist.organization_id,
          distribution_id: dist.id,
          party_id: l.party_id,
          share_bps: l.share_bps,
          amount_minor: l.amount_minor,
        }))
      ),
    });
  }

  async getDistribution(user: AuthUser, orgId: string, distId: string): Promise<ProfitDistributionDto | null> {
    const list = await this.listDistributions(user, orgId);
    return list.find((d) => d.id === distId) ?? null;
  }

  async updateDistribution(user: AuthUser, orgId: string, dist: ProfitDistributionDto): Promise<void> {
    await this.rest(
      user,
      `profit_distributions?organization_id=eq.${encodeURIComponent(orgId)}&id=eq.${encodeURIComponent(dist.id)}`,
      { method: 'PATCH', body: JSON.stringify({ status: dist.status }) }
    );
  }

  async listCompensationArrangements(user: AuthUser, orgId: string): Promise<CompensationArrangementDto[]> {
    return this.rest<CompensationArrangementDto[]>(
      user,
      `compensation_arrangements?select=*&organization_id=eq.${encodeURIComponent(orgId)}`
    );
  }

  async saveCompensationArrangement(user: AuthUser, _orgId: string, arr: CompensationArrangementDto): Promise<void> {
    await this.rest(user, 'compensation_arrangements', { method: 'POST', body: JSON.stringify(arr) });
  }

  async listSalaryRuns(user: AuthUser, orgId: string): Promise<SalaryRunDto[]> {
    return this.rest<SalaryRunDto[]>(
      user,
      `salary_runs?select=*&organization_id=eq.${encodeURIComponent(orgId)}`
    );
  }

  async saveSalaryRun(user: AuthUser, _orgId: string, run: SalaryRunDto): Promise<void> {
    await this.rest(user, 'salary_runs', { method: 'POST', body: JSON.stringify(run) });
  }

  async getSalaryRun(user: AuthUser, orgId: string, runId: string): Promise<SalaryRunDto | null> {
    const list = await this.listSalaryRuns(user, orgId);
    return list.find((s) => s.id === runId) ?? null;
  }

  async updateSalaryRun(user: AuthUser, orgId: string, run: SalaryRunDto): Promise<void> {
    await this.rest(
      user,
      `salary_runs?organization_id=eq.${encodeURIComponent(orgId)}&id=eq.${encodeURIComponent(run.id)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ payment_entry_id: run.payment_entry_id, status: run.status }),
      }
    );
  }

  async listAssets(user: AuthUser, orgId: string): Promise<AssetDto[]> {
    return this.rest<AssetDto[]>(user, `assets?select=*&organization_id=eq.${encodeURIComponent(orgId)}`);
  }

  async saveAsset(user: AuthUser, _orgId: string, asset: AssetDto): Promise<void> {
    await this.rest(user, 'assets', { method: 'POST', body: JSON.stringify(asset) });
  }

  async listLiabilities(user: AuthUser, orgId: string): Promise<LiabilityDto[]> {
    return this.rest<LiabilityDto[]>(user, `liabilities?select=*&organization_id=eq.${encodeURIComponent(orgId)}`);
  }

  async saveLiability(user: AuthUser, _orgId: string, liability: LiabilityDto): Promise<void> {
    await this.rest(user, 'liabilities', { method: 'POST', body: JSON.stringify(liability) });
  }
}
