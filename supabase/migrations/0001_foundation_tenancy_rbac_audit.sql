-- Purpose: Phase 3 foundation schema (tenancy, plans/module flags, RBAC permission catalog, forced RLS, hash-chained audit log, idempotency, outbox, support grants)
-- Requirement/ADR: FR-001, FR-010, NFR-001, BR-019, BR-021, OQ-014, OQ-019, OQ-023, ADR-0002, ADR-0003, ADR-0005
-- Risk: low (initial schema creation on clean database)
-- Rollback: down script drops created objects in reverse dependency order (pre-launch only)
-- Tested on: pending local Supabase / CI pgTAP run

set lock_timeout = '5s';
set statement_timeout = '30s';

create extension if not exists pgcrypto;

-- 1. Non-exposed internal schema (L8, AUTHORIZATION_RBAC_RLS.md)
create schema if not exists private;
revoke all on schema private from public;
revoke all on schema private from anon;
revoke all on schema private from authenticated;

-- 2. SaaS billing-ready plans catalog (OQ-019)
create table if not exists public.plans (
  code text primary key,
  name text not null,
  max_members integer not null check (max_members > 0),
  max_monthly_entries integer not null check (max_monthly_entries > 0),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

insert into public.plans (code, name, max_members, max_monthly_entries) values
  ('starter', 'Starter', 5, 2000),
  ('growth', 'Growth', 25, 25000),
  ('enterprise', 'Enterprise', 250, 500000)
on conflict (code) do nothing;

-- 3. Permission catalog (single source of truth synced with packages/contracts)
create table if not exists public.permissions (
  code text primary key
);

create table if not exists public.role_permissions (
  role text not null check (role in ('owner', 'admin', 'accountant', 'manager', 'employee', 'investor', 'auditor')),
  permission_code text not null references public.permissions(code) on delete restrict,
  primary key (role, permission_code)
);

insert into public.permissions (code) values
  ('organizations:read'),
  ('organizations:write'),
  ('accounts:read'),
  ('accounts:write'),
  ('banking:read'),
  ('banking:write'),
  ('transactions:draft'),
  ('transactions:draft_own'),
  ('transactions:import'),
  ('ledger:draft'),
  ('ledger:post'),
  ('expenses:approve'),
  ('expenses:approve_scoped'),
  ('period:close'),
  ('period:reopen'),
  ('reports:read'),
  ('reports:read_scoped'),
  ('individual_ledger:read'),
  ('individual_ledger:read_team'),
  ('individual_ledger:read_own'),
  ('profit_sharing:read'),
  ('profit_sharing:read_own'),
  ('profit_sharing:write'),
  ('profit_sharing:run'),
  ('members:read'),
  ('members:write'),
  ('api_keys:write'),
  ('data:export'),
  ('data:export_own'),
  ('audit:read'),
  ('billing:write')
on conflict (code) do nothing;

insert into public.role_permissions (role, permission_code) values
  ('owner', 'organizations:read'),
  ('owner', 'organizations:write'),
  ('owner', 'accounts:read'),
  ('owner', 'accounts:write'),
  ('owner', 'banking:read'),
  ('owner', 'banking:write'),
  ('owner', 'transactions:draft'),
  ('owner', 'transactions:import'),
  ('owner', 'ledger:draft'),
  ('owner', 'ledger:post'),
  ('owner', 'expenses:approve'),
  ('owner', 'period:close'),
  ('owner', 'period:reopen'),
  ('owner', 'reports:read'),
  ('owner', 'individual_ledger:read'),
  ('owner', 'profit_sharing:read'),
  ('owner', 'profit_sharing:write'),
  ('owner', 'profit_sharing:run'),
  ('owner', 'members:read'),
  ('owner', 'members:write'),
  ('owner', 'api_keys:write'),
  ('owner', 'data:export'),
  ('owner', 'audit:read'),
  ('owner', 'billing:write'),
  ('admin', 'organizations:read'),
  ('admin', 'organizations:write'),
  ('admin', 'accounts:read'),
  ('admin', 'accounts:write'),
  ('admin', 'banking:read'),
  ('admin', 'banking:write'),
  ('admin', 'transactions:draft'),
  ('admin', 'transactions:import'),
  ('admin', 'ledger:draft'),
  ('admin', 'expenses:approve'),
  ('admin', 'reports:read'),
  ('admin', 'individual_ledger:read'),
  ('admin', 'profit_sharing:read'),
  ('admin', 'members:read'),
  ('admin', 'members:write'),
  ('admin', 'api_keys:write'),
  ('admin', 'data:export'),
  ('admin', 'audit:read'),
  ('accountant', 'organizations:read'),
  ('accountant', 'accounts:read'),
  ('accountant', 'accounts:write'),
  ('accountant', 'banking:read'),
  ('accountant', 'banking:write'),
  ('accountant', 'transactions:draft'),
  ('accountant', 'transactions:import'),
  ('accountant', 'ledger:draft'),
  ('accountant', 'ledger:post'),
  ('accountant', 'expenses:approve'),
  ('accountant', 'period:close'),
  ('accountant', 'reports:read'),
  ('accountant', 'individual_ledger:read'),
  ('accountant', 'profit_sharing:read'),
  ('accountant', 'profit_sharing:write'),
  ('accountant', 'profit_sharing:run'),
  ('accountant', 'data:export'),
  ('accountant', 'audit:read'),
  ('manager', 'organizations:read'),
  ('manager', 'accounts:read'),
  ('manager', 'banking:read'),
  ('manager', 'transactions:draft'),
  ('manager', 'ledger:draft'),
  ('manager', 'expenses:approve_scoped'),
  ('manager', 'reports:read_scoped'),
  ('manager', 'individual_ledger:read_team'),
  ('employee', 'organizations:read'),
  ('employee', 'transactions:draft_own'),
  ('employee', 'individual_ledger:read_own'),
  ('investor', 'organizations:read'),
  ('investor', 'individual_ledger:read_own'),
  ('investor', 'profit_sharing:read_own'),
  ('investor', 'data:export_own'),
  ('auditor', 'organizations:read'),
  ('auditor', 'accounts:read'),
  ('auditor', 'banking:read'),
  ('auditor', 'reports:read'),
  ('auditor', 'individual_ledger:read'),
  ('auditor', 'profit_sharing:read'),
  ('auditor', 'data:export'),
  ('auditor', 'audit:read')
on conflict (role, permission_code) do nothing;

-- 4. Tenant core tables
create table if not exists public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) >= 2),
  base_currency char(3) not null check (base_currency ~ '^[A-Z]{3}$'),
  country char(2) not null check (country ~ '^[A-Z]{2}$'),
  fiscal_year_start_month smallint not null default 1 check (fiscal_year_start_month between 1 and 12),
  status text not null default 'active' check (status in ('active', 'suspended')),
  plan_code text not null default 'starter' references public.plans(code),
  created_by uuid not null,
  created_at timestamptz not null default now()
);

create table if not exists public.organization_modules (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  module_key text not null,
  enabled boolean not null default false,
  updated_at timestamptz not null default now(),
  unique (organization_id, module_key),
  unique (organization_id, id)
);

create table if not exists public.parties (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  party_type text not null check (party_type in ('investor', 'manager', 'employee', 'supplier', 'customer', 'owner')),
  display_name text not null check (char_length(trim(display_name)) >= 1),
  email_redacted text,
  pseudonymized_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

create table if not exists public.org_members (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null,
  role text not null check (role in ('owner', 'admin', 'accountant', 'manager', 'employee', 'investor', 'auditor')),
  party_id uuid,
  status text not null default 'active' check (status in ('active', 'invited', 'suspended', 'removed')),
  created_at timestamptz not null default now(),
  unique (organization_id, user_id),
  unique (organization_id, id),
  foreign key (organization_id, party_id) references public.parties(organization_id, id) on delete restrict
);

create table if not exists public.org_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  email text not null,
  role text not null check (role in ('owner', 'admin', 'accountant', 'manager', 'employee', 'investor', 'auditor')),
  party_id uuid,
  token_hash text not null,
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked', 'expired')),
  expires_at timestamptz not null,
  created_by uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, party_id) references public.parties(organization_id, id) on delete restrict
);

-- 5. Hash-chained audit log (ADR-0005, BR-021, T-17)
create table if not exists public.audit_events (
  id uuid primary key default gen_random_uuid(),
  seq_no bigint generated always as identity,
  organization_id uuid not null references public.organizations(id) on delete restrict,
  actor_id uuid,
  actor_type text not null check (actor_type in ('user', 'system', 'api_key', 'support_grant')),
  action text not null,
  entity_type text not null,
  entity_id text,
  before_hash text,
  payload_json jsonb not null default '{}'::jsonb,
  request_id text not null,
  ip_hash text,
  prev_hash text not null,
  row_hash text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, seq_no)
);

-- 6. Idempotency store scoped by (organization_id, user_id, route, idempotency_key) (BR-013, F-16)
create table if not exists public.idempotency_keys (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  user_id uuid not null,
  route text not null,
  idempotency_key text not null,
  request_hash text not null,
  status_code integer not null,
  response_body jsonb not null,
  created_at timestamptz not null default now(),
  expires_at timestamptz not null default (now() + interval '24 hours'),
  unique (organization_id, user_id, route, idempotency_key)
);

-- 7. Transactional outbox for module decoupling (MODULE_ARCHITECTURE.md)
create table if not exists public.outbox_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  event_type text not null,
  payload jsonb not null default '{}'::jsonb,
  processed_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

-- 8. Time-limited, customer-granted support access (OQ-014, ST-20)
create table if not exists public.support_access_grants (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  granted_by uuid not null,
  support_user_id uuid not null,
  reason text not null check (char_length(trim(reason)) >= 10),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id)
);

-- Indexes on organization_id and hot lookup paths
create index if not exists idx_org_members_user on public.org_members (user_id, organization_id);
create index if not exists idx_parties_org on public.parties (organization_id);
create index if not exists idx_org_invitations_org on public.org_invitations (organization_id);
create index if not exists idx_audit_events_org_seq on public.audit_events (organization_id, seq_no desc);
create index if not exists idx_idempotency_expires on public.idempotency_keys (expires_at);
create index if not exists idx_outbox_unprocessed on public.outbox_events (organization_id, created_at) where processed_at is null;
create index if not exists idx_support_grants_org on public.support_access_grants (organization_id, support_user_id);

-- 9. Authorization helper in private schema (AUTHORIZATION_RBAC_RLS.md)
create or replace function private.has_permission(p_org_id uuid, p_permission text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.org_members m
    join public.role_permissions rp on rp.role = m.role
    where m.organization_id = p_org_id
      and m.user_id = (select auth.uid())
      and m.status = 'active'
      and rp.permission_code = p_permission
  );
$$;

revoke all on function private.has_permission(uuid, text) from public;
grant execute on function private.has_permission(uuid, text) to authenticated;

-- 10. Audit immutability & hash-chain functions (ADR-0005)
create or replace function private.forbid_audit_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'BR-021/T-17: audit_events is append-only; UPDATE and DELETE are forbidden';
end;
$$;

drop trigger if exists trg_audit_events_immutable on public.audit_events;
create trigger trg_audit_events_immutable
  before update or delete on public.audit_events
  for each row execute function private.forbid_audit_mutation();

revoke update, delete, truncate on public.audit_events from public, anon, authenticated, service_role;

create or replace function private.append_audit_event(
  p_org_id uuid,
  p_actor_id uuid,
  p_actor_type text,
  p_action text,
  p_entity_type text,
  p_entity_id text,
  p_before_hash text,
  p_payload jsonb,
  p_request_id text,
  p_ip_hash text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prev_hash text;
  v_row_hash text;
  v_id uuid := gen_random_uuid();
  v_now timestamptz := now();
  v_canonical text;
begin
  perform pg_advisory_xact_lock(hashtext('audit:' || p_org_id::text));

  select a.row_hash
  into v_prev_hash
  from public.audit_events a
  where a.organization_id = p_org_id
  order by a.seq_no desc
  limit 1;

  if v_prev_hash is null then
    v_prev_hash := repeat('0', 64);
  end if;

  v_canonical := coalesce(p_org_id::text, '') || '|' ||
                 coalesce(p_actor_id::text, '') || '|' ||
                 p_actor_type || '|' ||
                 p_action || '|' ||
                 p_entity_type || '|' ||
                 coalesce(p_entity_id, '') || '|' ||
                 coalesce(p_before_hash, '') || '|' ||
                 coalesce(p_payload::text, '{}') || '|' ||
                 p_request_id || '|' ||
                 v_now::text;

  v_row_hash := encode(extensions.digest(v_prev_hash || '|' || v_canonical, 'sha256'), 'hex');

  insert into public.audit_events (
    id, organization_id, actor_id, actor_type, action, entity_type, entity_id,
    before_hash, payload_json, request_id, ip_hash, prev_hash, row_hash, created_at
  ) values (
    v_id, p_org_id, p_actor_id, p_actor_type, p_action, p_entity_type, p_entity_id,
    p_before_hash, coalesce(p_payload, '{}'::jsonb), p_request_id, p_ip_hash, v_prev_hash, v_row_hash, v_now
  );

  return v_id;
end;
$$;

revoke all on function private.append_audit_event(uuid, uuid, text, text, text, text, text, jsonb, text, text) from public;

-- Last-Owner invariant trigger (USER_ROLES.md #4, ST-08)
create or replace function private.protect_last_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_remaining_owners integer;
begin
  if (tg_op = 'DELETE' and old.role = 'owner' and old.status = 'active') or
     (tg_op = 'UPDATE' and old.role = 'owner' and old.status = 'active' and (new.role <> 'owner' or new.status <> 'active')) then
    select count(*)
    into v_remaining_owners
    from public.org_members m
    where m.organization_id = old.organization_id
      and m.id <> old.id
      and m.role = 'owner'
      and m.status = 'active';

    if v_remaining_owners = 0 then
      raise exception 'USER_ROLES: The last active Owner of an organization cannot be removed or downgraded';
    end if;
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_protect_last_owner on public.org_members;
create trigger trg_protect_last_owner
  before update or delete on public.org_members
  for each row execute function private.protect_last_owner();

-- 11. Atomic RPC endpoints (ADR-0003)
create or replace function public.rpc_create_organization(
  p_name text,
  p_base_currency char(3),
  p_country char(2),
  p_fiscal_year_start_month smallint default 1,
  p_request_id text default 'rpc'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_org_id uuid;
  v_party_id uuid;
begin
  if v_uid is null then
    raise exception 'Authentication required';
  end if;

  insert into public.organizations (name, base_currency, country, fiscal_year_start_month, created_by)
  values (trim(p_name), p_base_currency, p_country, p_fiscal_year_start_month, v_uid)
  returning id into v_org_id;

  insert into public.parties (organization_id, party_type, display_name)
  values (v_org_id, 'owner', 'Organization Owner')
  returning id into v_party_id;

  insert into public.org_members (organization_id, user_id, role, party_id, status)
  values (v_org_id, v_uid, 'owner', v_party_id, 'active');

  insert into public.organization_modules (organization_id, module_key, enabled) values
    (v_org_id, 'core_ledger', true),
    (v_org_id, 'banking', true),
    (v_org_id, 'reports', true),
    (v_org_id, 'investors', false),
    (v_org_id, 'profit_sharing', false),
    (v_org_id, 'ebay_integration', false);

  perform private.append_audit_event(
    v_org_id,
    v_uid,
    'user',
    'organization.created',
    'organization',
    v_org_id::text,
    null,
    jsonb_build_object('name', trim(p_name), 'base_currency', p_base_currency, 'country', p_country),
    p_request_id
  );

  insert into public.outbox_events (organization_id, event_type, payload)
  values (v_org_id, 'organization.created', jsonb_build_object('organization_id', v_org_id));

  return v_org_id;
end;
$$;

revoke all on function public.rpc_create_organization(text, char(3), char(2), smallint, text) from public;
grant execute on function public.rpc_create_organization(text, char(3), char(2), smallint, text) to authenticated;

create or replace function public.rpc_verify_audit_chain(p_org_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rec record;
  v_expected_prev text := repeat('0', 64);
  v_canonical text;
  v_calc_hash text;
begin
  if not private.has_permission(p_org_id, 'audit:read') then
    raise exception 'Forbidden';
  end if;

  for v_rec in
    select *
    from public.audit_events a
    where a.organization_id = p_org_id
    order by a.seq_no asc
  loop
    if v_rec.prev_hash <> v_expected_prev then
      return false;
    end if;

    v_canonical := coalesce(v_rec.organization_id::text, '') || '|' ||
                   coalesce(v_rec.actor_id::text, '') || '|' ||
                   v_rec.actor_type || '|' ||
                   v_rec.action || '|' ||
                   v_rec.entity_type || '|' ||
                   coalesce(v_rec.entity_id, '') || '|' ||
                   coalesce(v_rec.before_hash, '') || '|' ||
                   coalesce(v_rec.payload_json::text, '{}') || '|' ||
                   v_rec.request_id || '|' ||
                   v_rec.created_at::text;

    v_calc_hash := encode(extensions.digest(v_rec.prev_hash || '|' || v_canonical, 'sha256'), 'hex');
    if v_rec.row_hash <> v_calc_hash then
      return false;
    end if;

    v_expected_prev := v_rec.row_hash;
  end loop;

  return true;
end;
$$;

revoke all on function public.rpc_verify_audit_chain(uuid) from public;
grant execute on function public.rpc_verify_audit_chain(uuid) to authenticated;

-- 12. RLS Coverage Verification Helper (DATABASE_MIGRATIONS.md #4)
create or replace function private.verify_rls_coverage()
returns table(table_name text, rls_enabled boolean, rls_forced boolean)
language sql
stable
set search_path = ''
as $$
  select c.relname::text, c.relrowsecurity, c.relforcerowsecurity
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and (not c.relrowsecurity or not c.relforcerowsecurity);
$$;

-- 13. Enable and FORCE RLS on every public table (ADR-0002, AUTHORIZATION_RBAC_RLS.md)
alter table public.plans enable row level security;
alter table public.plans force row level security;

alter table public.permissions enable row level security;
alter table public.permissions force row level security;

alter table public.role_permissions enable row level security;
alter table public.role_permissions force row level security;

alter table public.organizations enable row level security;
alter table public.organizations force row level security;

alter table public.organization_modules enable row level security;
alter table public.organization_modules force row level security;

alter table public.parties enable row level security;
alter table public.parties force row level security;

alter table public.org_members enable row level security;
alter table public.org_members force row level security;

alter table public.org_invitations enable row level security;
alter table public.org_invitations force row level security;

alter table public.audit_events enable row level security;
alter table public.audit_events force row level security;

alter table public.idempotency_keys enable row level security;
alter table public.idempotency_keys force row level security;

alter table public.outbox_events enable row level security;
alter table public.outbox_events force row level security;

alter table public.support_access_grants enable row level security;
alter table public.support_access_grants force row level security;

-- Reference tables: authenticated read-only
create policy plans_select on public.plans
  for select to authenticated using (true);

create policy permissions_select on public.permissions
  for select to authenticated using (true);

create policy role_permissions_select on public.role_permissions
  for select to authenticated using (true);

-- Tenant tables: strict organization-scoped policies (no anon access)
create policy organizations_select on public.organizations
  for select to authenticated
  using (private.has_permission(id, 'organizations:read'));

create policy organizations_update on public.organizations
  for update to authenticated
  using (private.has_permission(id, 'organizations:write'))
  with check (private.has_permission(id, 'organizations:write'));

create policy org_modules_select on public.organization_modules
  for select to authenticated
  using (private.has_permission(organization_id, 'organizations:read'));

create policy org_modules_update on public.organization_modules
  for update to authenticated
  using (private.has_permission(organization_id, 'organizations:write'))
  with check (private.has_permission(organization_id, 'organizations:write'));

create policy parties_select on public.parties
  for select to authenticated
  using (private.has_permission(organization_id, 'organizations:read'));

create policy parties_insert on public.parties
  for insert to authenticated
  with check (private.has_permission(organization_id, 'members:write'));

create policy org_members_select on public.org_members
  for select to authenticated
  using (
    private.has_permission(organization_id, 'members:read')
    or user_id = (select auth.uid())
  );

create policy org_members_insert on public.org_members
  for insert to authenticated
  with check (private.has_permission(organization_id, 'members:write'));

create policy org_members_update on public.org_members
  for update to authenticated
  using (private.has_permission(organization_id, 'members:write'))
  with check (private.has_permission(organization_id, 'members:write'));

create policy org_members_delete on public.org_members
  for delete to authenticated
  using (private.has_permission(organization_id, 'members:write'));

create policy org_invitations_select on public.org_invitations
  for select to authenticated
  using (private.has_permission(organization_id, 'members:read'));

create policy org_invitations_insert on public.org_invitations
  for insert to authenticated
  with check (private.has_permission(organization_id, 'members:write'));

create policy audit_events_select on public.audit_events
  for select to authenticated
  using (private.has_permission(organization_id, 'audit:read'));

-- Intentionally NO update/delete policies on audit_events, idempotency_keys, or outbox_events for authenticated users
create policy idempotency_keys_select on public.idempotency_keys
  for select to authenticated
  using (
    user_id = (select auth.uid())
    and private.has_permission(organization_id, 'organizations:read')
  );

create policy support_grants_select on public.support_access_grants
  for select to authenticated
  using (private.has_permission(organization_id, 'audit:read'));

create policy support_grants_insert on public.support_access_grants
  for insert to authenticated
  with check (private.has_permission(organization_id, 'organizations:write'));
