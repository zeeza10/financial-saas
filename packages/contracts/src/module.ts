import type { OrgRole, Permission } from './permissions.js';

export interface AuthUser {
  userId: string;
  email: string;
  aal: 'aal1' | 'aal2';
  accessToken: string;
}

export class ApiDomainError extends Error {
  constructor(
    readonly status: number,
    readonly title: string,
    readonly detail?: string
  ) {
    super(title);
    this.name = 'ApiDomainError';
  }
}

export interface PlatformContext {
  requirePermission(
    user: AuthUser,
    organizationId: string,
    permission: Permission
  ): Promise<{ role: OrgRole }>;
  getUserPartyId(user: AuthUser, organizationId: string): Promise<string | null>;
  getOrganizationBaseCurrency(user: AuthUser, organizationId: string): Promise<string>;
  appendAudit(params: {
    organizationId: string;
    actorId: string;
    actorType: 'user' | 'system';
    action: string;
    entityType: string;
    entityId: string | null;
    payload: Record<string, unknown>;
    requestId: string;
  }): Promise<void>;
}
