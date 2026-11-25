import { z } from 'zod';

/**
 * Organization roles defined in docs/product/USER_ROLES.md.
 * Single source of truth used by both TypeScript authorization and SQL seeding.
 */
export const OrgRoleSchema = z.enum([
  'owner',
  'admin',
  'accountant',
  'manager',
  'employee',
  'investor',
  'auditor',
]);

export type OrgRole = z.infer<typeof OrgRoleSchema>;

export const ORG_ROLES: readonly OrgRole[] = OrgRoleSchema.options;

/**
 * Roles requiring MFA per OQ-023 (closed 2026-11-26) and AUTH_SECURITY.md.
 */
export const MFA_REQUIRED_ROLES: readonly OrgRole[] = ['owner', 'admin', 'accountant'];

export function roleRequiresMfa(role: OrgRole): boolean {
  return (MFA_REQUIRED_ROLES as readonly string[]).includes(role);
}

export const PERMISSIONS = [
  'organizations:read',
  'organizations:write',
  'accounts:read',
  'accounts:write',
  'banking:read',
  'banking:write',
  'transactions:draft',
  'transactions:draft_own',
  'transactions:import',
  'ledger:draft',
  'ledger:post',
  'expenses:approve',
  'expenses:approve_scoped',
  'period:close',
  'period:reopen',
  'reports:read',
  'reports:read_scoped',
  'individual_ledger:read',
  'individual_ledger:read_team',
  'individual_ledger:read_own',
  'profit_sharing:read',
  'profit_sharing:read_own',
  'profit_sharing:write',
  'profit_sharing:run',
  'members:read',
  'members:write',
  'api_keys:write',
  'data:export',
  'data:export_own',
  'audit:read',
  'billing:write',
] as const;

export type Permission = (typeof PERMISSIONS)[number];

export const PermissionSchema = z.enum(PERMISSIONS);

/**
 * Canonical role-to-permission matrix derived from docs/product/USER_ROLES.md.
 */
export const ROLE_PERMISSIONS: Readonly<Record<OrgRole, readonly Permission[]>> = {
  owner: [
    'organizations:read',
    'organizations:write',
    'accounts:read',
    'accounts:write',
    'banking:read',
    'banking:write',
    'transactions:draft',
    'transactions:import',
    'ledger:draft',
    'ledger:post',
    'expenses:approve',
    'period:close',
    'period:reopen',
    'reports:read',
    'individual_ledger:read',
    'profit_sharing:read',
    'profit_sharing:write',
    'profit_sharing:run',
    'members:read',
    'members:write',
    'api_keys:write',
    'data:export',
    'audit:read',
    'billing:write',
  ],
  admin: [
    'organizations:read',
    'organizations:write',
    'accounts:read',
    'accounts:write',
    'banking:read',
    'banking:write',
    'transactions:draft',
    'transactions:import',
    'ledger:draft',
    'expenses:approve',
    'reports:read',
    'individual_ledger:read',
    'profit_sharing:read',
    'members:read',
    'members:write',
    'api_keys:write',
    'data:export',
    'audit:read',
  ],
  accountant: [
    'organizations:read',
    'accounts:read',
    'accounts:write',
    'banking:read',
    'banking:write',
    'transactions:draft',
    'transactions:import',
    'ledger:draft',
    'ledger:post',
    'expenses:approve',
    'period:close',
    'reports:read',
    'individual_ledger:read',
    'profit_sharing:read',
    'profit_sharing:write',
    'profit_sharing:run',
    'data:export',
    'audit:read',
  ],
  manager: [
    'organizations:read',
    'accounts:read',
    'banking:read',
    'transactions:draft',
    'ledger:draft',
    'expenses:approve_scoped',
    'reports:read_scoped',
    'individual_ledger:read_team',
  ],
  employee: [
    'organizations:read',
    'transactions:draft_own',
    'individual_ledger:read_own',
  ],
  investor: [
    'organizations:read',
    'individual_ledger:read_own',
    'profit_sharing:read_own',
    'data:export_own',
  ],
  auditor: [
    'organizations:read',
    'accounts:read',
    'banking:read',
    'reports:read',
    'individual_ledger:read',
    'profit_sharing:read',
    'data:export',
    'audit:read',
  ],
};

export function hasRolePermission(role: OrgRole, permission: Permission): boolean {
  return (ROLE_PERMISSIONS[role] as readonly string[]).includes(permission);
}

/**
 * Generates deterministic SQL inserts for permissions and role_permissions so
 * SQL authorization tables stay synchronized with packages/contracts (ST-06).
 */
export function generatePermissionCatalogSql(): string {
  const permValues = PERMISSIONS.map((p) => `  ('${p}')`).join(',\n');
  const rpPairs: string[] = [];
  for (const role of ORG_ROLES) {
    for (const perm of ROLE_PERMISSIONS[role]) {
      rpPairs.push(`  ('${role}', '${perm}')`);
    }
  }
  return [
    'insert into public.permissions (code) values',
    `${permValues}`,
    'on conflict (code) do nothing;',
    '',
    'insert into public.role_permissions (role, permission_code) values',
    `${rpPairs.join(',\n')}`,
    'on conflict (role, permission_code) do nothing;',
  ].join('\n');
}
