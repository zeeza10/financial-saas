import {
  ApiDomainError,
  hasRolePermission,
  type AuditEventDto,
  type AuthUser,
  type CreateOrganizationRequest,
  type InviteMemberRequest,
  type MemberDto,
  type OrganizationDto,
  type OrgRole,
  type Permission,
  type PlatformContext,
} from '@financial-saas/contracts';
import { sha256Hex } from './security.js';
import type { ApiEnv } from './env.js';

export { ApiDomainError, type AuthUser };

export interface IdempotencyRecord {
  requestHash: string;
  statusCode: number;
  responseBody: unknown;
}

export interface DataStore extends PlatformContext {
  listOrganizations(user: AuthUser): Promise<OrganizationDto[]>;
  createOrganization(
    user: AuthUser,
    input: CreateOrganizationRequest,
    requestId: string
  ): Promise<OrganizationDto>;
  getMembership(
    user: AuthUser,
    organizationId: string
  ): Promise<{ role: OrgRole; status: string } | null>;
  listMembers(user: AuthUser, organizationId: string): Promise<MemberDto[]>;
  inviteMember(
    user: AuthUser,
    organizationId: string,
    input: InviteMemberRequest,
    requestId: string
  ): Promise<MemberDto>;
  updateMemberRole(
    user: AuthUser,
    organizationId: string,
    memberId: string,
    newRole: OrgRole,
    requestId: string
  ): Promise<MemberDto>;
  removeMember(
    user: AuthUser,
    organizationId: string,
    memberId: string,
    requestId: string
  ): Promise<void>;
  listAuditEvents(
    user: AuthUser,
    organizationId: string,
    limit: number
  ): Promise<AuditEventDto[]>;
  verifyAuditChain(user: AuthUser, organizationId: string): Promise<boolean>;
  getIdempotencyRecord(params: {
    user: AuthUser;
    organizationId: string;
    route: string;
    key: string;
  }): Promise<IdempotencyRecord | null>;
  saveIdempotencyRecord(params: {
    user: AuthUser;
    organizationId: string;
    route: string;
    key: string;
    requestHash: string;
    statusCode: number;
    responseBody: unknown;
  }): Promise<void>;
}

/**
 * Deterministic in-memory DataStore that mirrors Postgres RLS, composite-FK org scoping,
 * last-Owner trigger, hash-chained audit_events, and idempotency scoping for fast tests.
 */
export class InMemoryDataStore implements DataStore {
  private readonly orgs = new Map<string, Omit<OrganizationDto, 'role'>>();
  private readonly members = new Map<string, MemberDto>();
  private readonly auditEvents = new Map<string, AuditEventDto[]>();
  private readonly idempotency = new Map<string, IdempotencyRecord>();

  async appendAudit(params: {
    organizationId: string;
    actorId: string;
    actorType: 'user' | 'system';
    action: string;
    entityType: string;
    entityId: string | null;
    payload: Record<string, unknown>;
    requestId: string;
  }): Promise<void> {
    const list = this.auditEvents.get(params.organizationId) ?? [];
    const prevHash = list.length > 0 ? list[list.length - 1]!.row_hash : '0'.repeat(64);
    const createdAt = new Date().toISOString();
    const canonical = [
      params.organizationId,
      params.actorId,
      params.actorType,
      params.action,
      params.entityType,
      params.entityId ?? '',
      JSON.stringify(params.payload),
      params.requestId,
      createdAt,
    ].join('|');
    const rowHash = await sha256Hex(`${prevHash}|${canonical}`);
    list.push({
      id: crypto.randomUUID(),
      organization_id: params.organizationId,
      actor_id: params.actorId,
      actor_type: params.actorType,
      action: params.action,
      entity_type: params.entityType,
      entity_id: params.entityId,
      payload_json: params.payload,
      request_id: params.requestId,
      prev_hash: prevHash,
      row_hash: rowHash,
      created_at: createdAt,
    });
    this.auditEvents.set(params.organizationId, list);
  }

  async requirePermission(
    user: AuthUser,
    organizationId: string,
    permission: Permission
  ): Promise<MemberDto> {
    const member = Array.from(this.members.values()).find(
      (m) =>
        m.organization_id === organizationId &&
        m.user_id === user.userId &&
        m.status === 'active'
    );
    if (!member) {
      // IDOR/BOLA: foreign or non-existent org returns 404 (ST-05)
      throw new ApiDomainError(404, 'Organization not found');
    }
    if (!hasRolePermission(member.role, permission)) {
      throw new ApiDomainError(403, 'Insufficient permissions');
    }
    return member;
  }

  async getUserPartyId(user: AuthUser, organizationId: string): Promise<string | null> {
    const member = Array.from(this.members.values()).find(
      (m) =>
        m.organization_id === organizationId &&
        m.user_id === user.userId &&
        m.status === 'active'
    );
    return member?.party_id ?? null;
  }

  async getOrganizationBaseCurrency(_user: AuthUser, organizationId: string): Promise<string> {
    const org = this.orgs.get(organizationId);
    if (!org) throw new ApiDomainError(404, 'Organization not found');
    return org.base_currency;
  }

  async listOrganizations(user: AuthUser): Promise<OrganizationDto[]> {
    const results: OrganizationDto[] = [];
    for (const member of this.members.values()) {
      if (member.user_id === user.userId && member.status === 'active') {
        const org = this.orgs.get(member.organization_id);
        if (org) {
          results.push({ ...org, role: member.role });
        }
      }
    }
    return results;
  }

  async createOrganization(
    user: AuthUser,
    input: CreateOrganizationRequest,
    requestId: string
  ): Promise<OrganizationDto> {
    const orgId = crypto.randomUUID();
    const createdAt = new Date().toISOString();
    const org: Omit<OrganizationDto, 'role'> = {
      id: orgId,
      name: input.name,
      base_currency: input.base_currency,
      country: input.country,
      fiscal_year_start_month: input.fiscal_year_start_month,
      status: 'active',
      plan_code: 'starter',
      created_at: createdAt,
    };
    this.orgs.set(orgId, org);

    const member: MemberDto = {
      id: crypto.randomUUID(),
      organization_id: orgId,
      user_id: user.userId,
      email: user.email,
      role: 'owner',
      party_id: null,
      status: 'active',
      created_at: createdAt,
    };
    this.members.set(member.id, member);

    await this.appendAudit({
      organizationId: orgId,
      actorId: user.userId,
      actorType: 'user',
      action: 'organization.created',
      entityType: 'organization',
      entityId: orgId,
      payload: { name: org.name, base_currency: org.base_currency, country: org.country },
      requestId,
    });

    return { ...org, role: 'owner' };
  }

  async getMembership(user: AuthUser, organizationId: string) {
    const member = Array.from(this.members.values()).find(
      (m) =>
        m.organization_id === organizationId &&
        m.user_id === user.userId &&
        m.status === 'active'
    );
    return member ? { role: member.role, status: member.status } : null;
  }

  async listMembers(user: AuthUser, organizationId: string): Promise<MemberDto[]> {
    await this.requirePermission(user, organizationId, 'members:read');
    return Array.from(this.members.values()).filter(
      (m) => m.organization_id === organizationId && m.status !== 'removed'
    );
  }

  async inviteMember(
    user: AuthUser,
    organizationId: string,
    input: InviteMemberRequest,
    requestId: string
  ): Promise<MemberDto> {
    const actor = await this.requirePermission(user, organizationId, 'members:write');
    if (actor.role === 'admin' && input.role === 'owner') {
      throw new ApiDomainError(403, 'Admins cannot invite or assign the Owner role');
    }

    const member: MemberDto = {
      id: crypto.randomUUID(),
      organization_id: organizationId,
      user_id: crypto.randomUUID(),
      email: input.email.toLowerCase(),
      role: input.role,
      party_id: input.party_id ?? null,
      status: 'invited',
      created_at: new Date().toISOString(),
    };
    this.members.set(member.id, member);

    await this.appendAudit({
      organizationId,
      actorId: user.userId,
      actorType: 'user',
      action: 'member.invited',
      entityType: 'org_member',
      entityId: member.id,
      payload: { role: member.role },
      requestId,
    });

    return member;
  }

  async updateMemberRole(
    user: AuthUser,
    organizationId: string,
    memberId: string,
    newRole: OrgRole,
    requestId: string
  ): Promise<MemberDto> {
    const actor = await this.requirePermission(user, organizationId, 'members:write');
    const target = this.members.get(memberId);
    if (!target || target.organization_id !== organizationId || target.status === 'removed') {
      throw new ApiDomainError(404, 'Member not found');
    }
    if (actor.role === 'admin' && (target.role === 'owner' || newRole === 'owner')) {
      throw new ApiDomainError(403, 'Admins cannot modify Owner memberships');
    }
    if (target.role === 'owner' && target.status === 'active' && newRole !== 'owner') {
      const otherOwners = Array.from(this.members.values()).filter(
        (m) =>
          m.organization_id === organizationId &&
          m.id !== target.id &&
          m.role === 'owner' &&
          m.status === 'active'
      );
      if (otherOwners.length === 0) {
        throw new ApiDomainError(409, 'The last active Owner cannot be downgraded');
      }
    }

    const updated: MemberDto = { ...target, role: newRole };
    this.members.set(memberId, updated);

    await this.appendAudit({
      organizationId,
      actorId: user.userId,
      actorType: 'user',
      action: 'member.role_updated',
      entityType: 'org_member',
      entityId: memberId,
      payload: { from_role: target.role, to_role: newRole },
      requestId,
    });

    return updated;
  }

  async removeMember(
    user: AuthUser,
    organizationId: string,
    memberId: string,
    requestId: string
  ): Promise<void> {
    const actor = await this.requirePermission(user, organizationId, 'members:write');
    const target = this.members.get(memberId);
    if (!target || target.organization_id !== organizationId || target.status === 'removed') {
      throw new ApiDomainError(404, 'Member not found');
    }
    if (actor.role === 'admin' && target.role === 'owner') {
      throw new ApiDomainError(403, 'Admins cannot remove an Owner');
    }
    if (target.role === 'owner' && target.status === 'active') {
      const otherOwners = Array.from(this.members.values()).filter(
        (m) =>
          m.organization_id === organizationId &&
          m.id !== target.id &&
          m.role === 'owner' &&
          m.status === 'active'
      );
      if (otherOwners.length === 0) {
        throw new ApiDomainError(409, 'The last active Owner cannot be removed');
      }
    }

    this.members.set(memberId, { ...target, status: 'removed' });

    await this.appendAudit({
      organizationId,
      actorId: user.userId,
      actorType: 'user',
      action: 'member.removed',
      entityType: 'org_member',
      entityId: memberId,
      payload: { role: target.role },
      requestId,
    });
  }

  async listAuditEvents(
    user: AuthUser,
    organizationId: string,
    limit: number
  ): Promise<AuditEventDto[]> {
    await this.requirePermission(user, organizationId, 'audit:read');
    const events = this.auditEvents.get(organizationId) ?? [];
    return events.slice(-limit).reverse();
  }

  async verifyAuditChain(user: AuthUser, organizationId: string): Promise<boolean> {
    await this.requirePermission(user, organizationId, 'audit:read');
    const events = this.auditEvents.get(organizationId) ?? [];
    let expectedPrev = '0'.repeat(64);
    for (const ev of events) {
      if (ev.prev_hash !== expectedPrev) return false;
      const canonical = [
        ev.organization_id,
        ev.actor_id ?? '',
        ev.actor_type,
        ev.action,
        ev.entity_type,
        ev.entity_id ?? '',
        JSON.stringify(ev.payload_json),
        ev.request_id,
        ev.created_at,
      ].join('|');
      const calc = await sha256Hex(`${ev.prev_hash}|${canonical}`);
      if (ev.row_hash !== calc) return false;
      expectedPrev = ev.row_hash;
    }
    return true;
  }

  async getIdempotencyRecord(params: {
    user: AuthUser;
    organizationId: string;
    route: string;
    key: string;
  }): Promise<IdempotencyRecord | null> {
    const mapKey = `${params.organizationId}|${params.user.userId}|${params.route}|${params.key}`;
    return this.idempotency.get(mapKey) ?? null;
  }

  async saveIdempotencyRecord(params: {
    user: AuthUser;
    organizationId: string;
    route: string;
    key: string;
    requestHash: string;
    statusCode: number;
    responseBody: unknown;
  }): Promise<void> {
    const mapKey = `${params.organizationId}|${params.user.userId}|${params.route}|${params.key}`;
    this.idempotency.set(mapKey, {
      requestHash: params.requestHash,
      statusCode: params.statusCode,
      responseBody: params.responseBody,
    });
  }
}

/**
 * Supabase PostgREST/RPC adapter executing strictly with the user's JWT (ADR-0003).
 * Never uses the service_role key.
 */
export class SupabaseRpcStore implements DataStore {
  constructor(private readonly env: ApiEnv) {}

  private async rest<T>(
    user: AuthUser,
    path: string,
    init?: RequestInit
  ): Promise<T> {
    const base = this.env.SUPABASE_URL.replace(/\/$/, '');
    const headers = new Headers(init?.headers);
    headers.set('apikey', this.env.SUPABASE_ANON_KEY);
    headers.set('Authorization', `Bearer ${user.accessToken}`);
    headers.set('Content-Type', 'application/json');

    const res = await fetch(`${base}/rest/v1/${path}`, {
      ...init,
      headers,
    });

    if (!res.ok) {
      if (res.status === 404) throw new ApiDomainError(404, 'Resource not found');
      if (res.status === 403) throw new ApiDomainError(403, 'Forbidden');
      throw new ApiDomainError(502, 'Database request failed');
    }
    if (res.status === 204) return undefined as T;
    return (await res.json()) as T;
  }

  async listOrganizations(user: AuthUser): Promise<OrganizationDto[]> {
    const rows = await this.rest<
      Array<{
        role: OrgRole;
        organizations: Omit<OrganizationDto, 'role'>;
      }>
    >(
      user,
      'org_members?select=role,organizations(id,name,base_currency,country,fiscal_year_start_month,status,plan_code,created_at)&status=eq.active'
    );
    return rows.map((r) => ({ ...r.organizations, role: r.role }));
  }

  async createOrganization(
    user: AuthUser,
    input: CreateOrganizationRequest,
    requestId: string
  ): Promise<OrganizationDto> {
    const orgId = await this.rest<string>(user, 'rpc/rpc_create_organization', {
      method: 'POST',
      body: JSON.stringify({
        p_name: input.name,
        p_base_currency: input.base_currency,
        p_country: input.country,
        p_fiscal_year_start_month: input.fiscal_year_start_month,
        p_request_id: requestId,
      }),
    });
    const orgs = await this.listOrganizations(user);
    const created = orgs.find((o) => o.id === orgId);
    if (!created) throw new ApiDomainError(500, 'Created organization not visible');
    return created;
  }

  async getMembership(user: AuthUser, organizationId: string) {
    const rows = await this.rest<Array<{ role: OrgRole; status: string }>>(
      user,
      `org_members?select=role,status&organization_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(user.userId)}&status=eq.active`
    );
    return rows[0] ?? null;
  }

  async listMembers(user: AuthUser, organizationId: string): Promise<MemberDto[]> {
    return this.rest<MemberDto[]>(
      user,
      `org_members?select=id,organization_id,user_id,role,party_id,status,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&status=neq.removed`
    );
  }

  async inviteMember(): Promise<MemberDto> {
    throw new ApiDomainError(501, 'Invite RPC migration pending Phase 3 Supabase link');
  }

  async updateMemberRole(
    user: AuthUser,
    organizationId: string,
    memberId: string,
    newRole: OrgRole
  ): Promise<MemberDto> {
    const rows = await this.rest<MemberDto[]>(
      user,
      `org_members?organization_id=eq.${encodeURIComponent(organizationId)}&id=eq.${encodeURIComponent(memberId)}`,
      {
        method: 'PATCH',
        headers: { Prefer: 'return=representation' },
        body: JSON.stringify({ role: newRole }),
      }
    );
    const updated = rows[0];
    if (!updated) throw new ApiDomainError(404, 'Member not found');
    return updated;
  }

  async removeMember(user: AuthUser, organizationId: string, memberId: string): Promise<void> {
    await this.rest(
      user,
      `org_members?organization_id=eq.${encodeURIComponent(organizationId)}&id=eq.${encodeURIComponent(memberId)}`,
      {
        method: 'PATCH',
        body: JSON.stringify({ status: 'removed' }),
      }
    );
  }

  async listAuditEvents(
    user: AuthUser,
    organizationId: string,
    limit: number
  ): Promise<AuditEventDto[]> {
    return this.rest<AuditEventDto[]>(
      user,
      `audit_events?select=id,organization_id,actor_id,actor_type,action,entity_type,entity_id,payload_json,request_id,prev_hash,row_hash,created_at&organization_id=eq.${encodeURIComponent(organizationId)}&order=seq_no.desc&limit=${limit}`
    );
  }

  async verifyAuditChain(user: AuthUser, organizationId: string): Promise<boolean> {
    return this.rest<boolean>(user, 'rpc/rpc_verify_audit_chain', {
      method: 'POST',
      body: JSON.stringify({ p_org_id: organizationId }),
    });
  }

  async requirePermission(
    user: AuthUser,
    organizationId: string,
    permission: Permission
  ): Promise<{ role: OrgRole }> {
    const m = await this.getMembership(user, organizationId);
    if (!m || m.status !== 'active') throw new ApiDomainError(404, 'Organization not found');
    if (!hasRolePermission(m.role, permission)) throw new ApiDomainError(403, 'Insufficient permissions');
    return { role: m.role };
  }

  async getUserPartyId(user: AuthUser, organizationId: string): Promise<string | null> {
    const rows = await this.rest<Array<{ party_id: string | null }>>(
      user,
      `org_members?select=party_id&organization_id=eq.${encodeURIComponent(organizationId)}&user_id=eq.${encodeURIComponent(user.userId)}&status=eq.active`
    );
    return rows[0]?.party_id ?? null;
  }

  async getOrganizationBaseCurrency(user: AuthUser, organizationId: string): Promise<string> {
    const orgs = await this.listOrganizations(user);
    const org = orgs.find((o) => o.id === organizationId);
    if (!org) throw new ApiDomainError(404, 'Organization not found');
    return org.base_currency;
  }

  async appendAudit(): Promise<void> {
    // Written atomically inside Postgres RPC functions in Supabase mode.
  }

  async getIdempotencyRecord(): Promise<IdempotencyRecord | null> {
    return null;
  }

  async saveIdempotencyRecord(): Promise<void> {
    // Handled inside Postgres RPC functions for live Supabase persistence.
  }
}
