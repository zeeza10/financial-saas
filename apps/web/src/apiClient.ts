import type {
  AuditEventDto,
  CreateOrganizationRequest,
  InviteMemberRequest,
  MemberDto,
  OrganizationDto,
  OrgRole,
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
    message: string
  ) {
    super(message);
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
    throw new ApiClientError(res.status, title);
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
};
