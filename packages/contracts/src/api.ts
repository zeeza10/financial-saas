import { z } from 'zod';
import { CurrencyCodeSchema } from './money.js';
import { OrgRoleSchema } from './permissions.js';

export const UuidSchema = z.string().uuid();

export const CursorPageQuerySchema = z
  .object({
    limit: z.coerce.number().int().min(1).max(200).default(50),
    cursor: z.string().min(1).max(256).optional(),
  })
  .strict();

export type CursorPageQuery = z.infer<typeof CursorPageQuerySchema>;

/**
 * Auth contracts (AUTH_SECURITY.md: minimum 12-character password).
 */
export const SignupRequestSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(12, 'Password must be at least 12 characters').max(256),
    display_name: z.string().trim().min(1).max(120),
  })
  .strict();

export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const LoginRequestSchema = z
  .object({
    email: z.string().trim().email().max(320),
    password: z.string().min(1).max(256),
  })
  .strict();

export type LoginRequest = z.infer<typeof LoginRequestSchema>;

export const OrganizationStatusSchema = z.enum(['active', 'suspended']);

export const CreateOrganizationRequestSchema = z
  .object({
    name: z.string().trim().min(2).max(120),
    base_currency: CurrencyCodeSchema,
    country: z
      .string()
      .trim()
      .regex(/^[A-Z]{2}$/, 'Country must be a 2-letter ISO 3166-1 alpha-2 code'),
    fiscal_year_start_month: z.number().int().min(1).max(12).default(1),
  })
  .strict();

export type CreateOrganizationRequest = z.infer<typeof CreateOrganizationRequestSchema>;

export const OrganizationSchema = z
  .object({
    id: UuidSchema,
    name: z.string(),
    base_currency: CurrencyCodeSchema,
    country: z.string(),
    fiscal_year_start_month: z.number().int().min(1).max(12),
    status: OrganizationStatusSchema,
    plan_code: z.string(),
    role: OrgRoleSchema,
    created_at: z.string(),
  })
  .strict();

export type OrganizationDto = z.infer<typeof OrganizationSchema>;

export const InviteMemberRequestSchema = z
  .object({
    email: z.string().trim().email().max(320),
    role: OrgRoleSchema,
    party_id: UuidSchema.nullable().optional(),
  })
  .strict();

export type InviteMemberRequest = z.infer<typeof InviteMemberRequestSchema>;

export const UpdateMemberRoleRequestSchema = z
  .object({
    role: OrgRoleSchema,
  })
  .strict();

export type UpdateMemberRoleRequest = z.infer<typeof UpdateMemberRoleRequestSchema>;

export const MemberStatusSchema = z.enum(['active', 'invited', 'suspended', 'removed']);

export const MemberSchema = z
  .object({
    id: UuidSchema,
    organization_id: UuidSchema,
    user_id: UuidSchema,
    email: z.string().email().optional(),
    role: OrgRoleSchema,
    party_id: UuidSchema.nullable(),
    status: MemberStatusSchema,
    created_at: z.string(),
  })
  .strict();

export type MemberDto = z.infer<typeof MemberSchema>;

export const AuditEventSchema = z
  .object({
    id: UuidSchema,
    organization_id: UuidSchema,
    actor_id: UuidSchema.nullable(),
    actor_type: z.enum(['user', 'system', 'api_key', 'support_grant']),
    action: z.string().min(1),
    entity_type: z.string().min(1),
    entity_id: z.string().nullable(),
    payload_json: z.record(z.unknown()),
    request_id: z.string().min(1),
    prev_hash: z.string(),
    row_hash: z.string(),
    created_at: z.string(),
  })
  .strict();

export type AuditEventDto = z.infer<typeof AuditEventSchema>;
