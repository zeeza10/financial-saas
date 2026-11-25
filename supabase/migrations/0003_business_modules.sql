-- Purpose: Phase 5 Business Modules schema (Invoices/Bills AP/AR, Payment Allocations, Investors/Shareholding, Versioned Profit Sharing & Distributions, Compensation & Salary Runs, Fixed Assets, Liabilities, Attachments)
-- Requirement/ADR: FR-011..FR-015, FR-018, BR-007, BR-009..BR-012, BR-014, BR-015, BR-017, BR-019, ADR-0002, ADR-0003
-- Risk: medium (new tables and party column addition; additive only)
-- Rollback: down script drops new tables and column in reverse dependency order
-- Tested on: pending local Supabase / CI pgTAP run

set lock_timeout = '5s';
set statement_timeout = '30s';

alter table public.parties
  add column if not exists shareholding_bps integer not null default 0 check (shareholding_bps between 0 and 10000);

-- 1. Open-item AP/AR (FR-011, BR-015, FT-25)
create table if not exists public.invoices_bills (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  kind text not null check (kind in ('bill', 'invoice', 'subscription')),
  doc_number text not null,
  party_id uuid not null,
  issue_date date not null,
  due_date date not null,
  total_minor bigint not null check (total_minor > 0),
  allocated_minor bigint not null default 0 check (allocated_minor >= 0 and allocated_minor <= total_minor),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'open' check (status in ('open', 'partially_settled', 'settled')),
  ledger_entry_id uuid not null,
  purpose text not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, kind, doc_number),
  foreign key (organization_id, party_id) references public.parties(organization_id, id) on delete restrict,
  foreign key (organization_id, ledger_entry_id) references public.journal_entries(organization_id, id) on delete restrict
);

create table if not exists public.payment_allocations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  invoice_bill_id uuid not null,
  payment_date date not null,
  amount_minor bigint not null check (amount_minor > 0),
  ledger_entry_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, invoice_bill_id) references public.invoices_bills(organization_id, id) on delete restrict,
  foreign key (organization_id, ledger_entry_id) references public.journal_entries(organization_id, id) on delete restrict
);

-- 2. Shareholding versions & Profit-Sharing Agreements (FR-012, FR-013, BR-010, BR-012, FT-12..FT-14, FT-34)
create table if not exists public.shareholding_versions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  party_id uuid not null,
  effective_from date not null,
  shareholding_bps integer not null check (shareholding_bps between 0 and 10000),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, party_id) references public.parties(organization_id, id) on delete restrict
);

create table if not exists public.profit_share_agreements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  effective_from date not null,
  effective_to date,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  check (effective_to is null or effective_to >= effective_from)
);

create table if not exists public.profit_share_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  agreement_id uuid not null,
  party_id uuid not null,
  share_bps integer not null check (share_bps between 0 and 10000),
  unique (organization_id, agreement_id, party_id),
  foreign key (organization_id, agreement_id) references public.profit_share_agreements(organization_id, id) on delete restrict,
  foreign key (organization_id, party_id) references public.parties(organization_id, id) on delete restrict
);

create table if not exists public.profit_distributions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  period_id uuid not null,
  agreement_id uuid not null,
  net_profit_minor bigint not null,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  ledger_entry_id uuid not null,
  status text not null default 'approved_unpaid' check (status in ('approved_unpaid', 'paid')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, period_id),
  foreign key (organization_id, period_id) references public.accounting_periods(organization_id, id) on delete restrict,
  foreign key (organization_id, agreement_id) references public.profit_share_agreements(organization_id, id) on delete restrict,
  foreign key (organization_id, ledger_entry_id) references public.journal_entries(organization_id, id) on delete restrict
);

create table if not exists public.profit_distribution_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  distribution_id uuid not null,
  party_id uuid not null,
  share_bps integer not null,
  amount_minor bigint not null,
  unique (organization_id, distribution_id, party_id),
  foreign key (organization_id, distribution_id) references public.profit_distributions(organization_id, id) on delete restrict,
  foreign key (organization_id, party_id) references public.parties(organization_id, id) on delete restrict
);

-- 3. Employees / Managers Compensation & Salary Runs (FR-014, BR-014, FT-26)
create table if not exists public.compensation_arrangements (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  party_id uuid not null,
  effective_from date not null,
  fixed_salary_minor bigint not null default 0 check (fixed_salary_minor >= 0),
  commission_bps integer not null default 0 check (commission_bps between 0 and 10000),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, party_id) references public.parties(organization_id, id) on delete restrict
);

create table if not exists public.salary_runs (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  party_id uuid not null,
  accrual_date date not null,
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  accrual_entry_id uuid not null,
  payment_entry_id uuid,
  status text not null default 'accrued' check (status in ('accrued', 'paid')),
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, party_id) references public.parties(organization_id, id) on delete restrict,
  foreign key (organization_id, accrual_entry_id) references public.journal_entries(organization_id, id) on delete restrict,
  foreign key (organization_id, payment_entry_id) references public.journal_entries(organization_id, id) on delete restrict
);

-- 4. Assets & Liabilities Registers (M14)
create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null,
  category text not null check (category in ('computer', 'laptop', 'equipment', 'furniture', 'other')),
  purchase_date date not null,
  purchase_cost_minor bigint not null check (purchase_cost_minor > 0),
  book_value_minor bigint not null check (book_value_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  assigned_party_id uuid,
  location text,
  status text not null default 'active' check (status in ('active', 'disposed')),
  ledger_entry_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, assigned_party_id) references public.parties(organization_id, id) on delete restrict,
  foreign key (organization_id, ledger_entry_id) references public.journal_entries(organization_id, id) on delete restrict
);

create table if not exists public.liabilities (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  lender_name text not null,
  origination_date date not null,
  principal_minor bigint not null check (principal_minor > 0),
  outstanding_minor bigint not null check (outstanding_minor >= 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  status text not null default 'open' check (status in ('open', 'settled')),
  ledger_entry_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, ledger_entry_id) references public.journal_entries(organization_id, id) on delete restrict
);

-- 5. Private Attachments Metadata (FR-018, T-11, DATA_PROTECTION.md)
create table if not exists public.attachments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  storage_key text not null,
  sha256_hex char(64) not null,
  mime_type text not null,
  size_bytes integer not null check (size_bytes > 0),
  scan_status text not null default 'pending' check (scan_status in ('pending', 'clean', 'quarantined')),
  uploaded_by uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, storage_key)
);

-- 6. GDPR Pseudonymization preserving immutable ledger (BR-019, FT-35)
create or replace function public.rpc_pseudonymize_party(
  p_org_id uuid,
  p_party_id uuid,
  p_request_id text default 'rpc'
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
begin
  if not private.has_permission(p_org_id, 'members:write') then
    raise exception 'Forbidden: members:write required';
  end if;

  update public.parties
  set display_name = 'Pseudonymized Party ' || left(id::text, 8),
      email_redacted = null,
      pseudonymized_at = now()
  where organization_id = p_org_id and id = p_party_id;

  if not found then
    raise exception 'Party not found';
  end if;

  perform private.append_audit_event(
    p_org_id,
    v_uid,
    'user',
    'party.pseudonymized',
    'party',
    p_party_id::text,
    null,
    jsonb_build_object('br', 'BR-019'),
    p_request_id
  );
end;
$$;

revoke all on function public.rpc_pseudonymize_party(uuid, uuid, text) from public;
grant execute on function public.rpc_pseudonymize_party(uuid, uuid, text) to authenticated;

-- 7. Enable and FORCE RLS on all 12 new public tables (ADR-0002)
alter table public.invoices_bills enable row level security;
alter table public.invoices_bills force row level security;

alter table public.payment_allocations enable row level security;
alter table public.payment_allocations force row level security;

alter table public.shareholding_versions enable row level security;
alter table public.shareholding_versions force row level security;

alter table public.profit_share_agreements enable row level security;
alter table public.profit_share_agreements force row level security;

alter table public.profit_share_lines enable row level security;
alter table public.profit_share_lines force row level security;

alter table public.profit_distributions enable row level security;
alter table public.profit_distributions force row level security;

alter table public.profit_distribution_lines enable row level security;
alter table public.profit_distribution_lines force row level security;

alter table public.compensation_arrangements enable row level security;
alter table public.compensation_arrangements force row level security;

alter table public.salary_runs enable row level security;
alter table public.salary_runs force row level security;

alter table public.assets enable row level security;
alter table public.assets force row level security;

alter table public.liabilities enable row level security;
alter table public.liabilities force row level security;

alter table public.attachments enable row level security;
alter table public.attachments force row level security;

-- Policies
create policy invoices_bills_select on public.invoices_bills
  for select to authenticated using (private.has_permission(organization_id, 'reports:read'));
create policy invoices_bills_insert on public.invoices_bills
  for insert to authenticated with check (private.has_permission(organization_id, 'transactions:draft'));

create policy payment_alloc_select on public.payment_allocations
  for select to authenticated using (private.has_permission(organization_id, 'reports:read'));
create policy payment_alloc_insert on public.payment_allocations
  for insert to authenticated with check (private.has_permission(organization_id, 'ledger:post'));

create policy shareholding_select on public.shareholding_versions
  for select to authenticated using (private.has_permission(organization_id, 'profit_sharing:read'));
create policy shareholding_insert on public.shareholding_versions
  for insert to authenticated with check (private.has_permission(organization_id, 'profit_sharing:write'));

create policy ps_agreements_select on public.profit_share_agreements
  for select to authenticated using (private.has_permission(organization_id, 'profit_sharing:read'));
create policy ps_agreements_insert on public.profit_share_agreements
  for insert to authenticated with check (private.has_permission(organization_id, 'profit_sharing:write'));

create policy ps_lines_select on public.profit_share_lines
  for select to authenticated using (private.has_permission(organization_id, 'profit_sharing:read'));
create policy ps_lines_insert on public.profit_share_lines
  for insert to authenticated with check (private.has_permission(organization_id, 'profit_sharing:write'));

create policy ps_dist_select on public.profit_distributions
  for select to authenticated using (
    private.has_permission(organization_id, 'profit_sharing:read')
    or private.has_permission(organization_id, 'profit_sharing:read_own')
  );
create policy ps_dist_insert on public.profit_distributions
  for insert to authenticated with check (private.has_permission(organization_id, 'profit_sharing:run'));

create policy ps_dist_lines_select on public.profit_distribution_lines
  for select to authenticated using (
    private.has_permission(organization_id, 'profit_sharing:read')
    or (
      private.has_permission(organization_id, 'profit_sharing:read_own')
      and exists (
        select 1 from public.org_members m
        where m.organization_id = profit_distribution_lines.organization_id
          and m.user_id = (select auth.uid())
          and m.status = 'active'
          and m.party_id = profit_distribution_lines.party_id
      )
    )
  );
create policy ps_dist_lines_insert on public.profit_distribution_lines
  for insert to authenticated with check (private.has_permission(organization_id, 'profit_sharing:run'));

create policy comp_select on public.compensation_arrangements
  for select to authenticated using (private.has_permission(organization_id, 'reports:read'));
create policy comp_insert on public.compensation_arrangements
  for insert to authenticated with check (private.has_permission(organization_id, 'members:write'));

create policy salary_runs_select on public.salary_runs
  for select to authenticated using (private.has_permission(organization_id, 'reports:read'));
create policy salary_runs_insert on public.salary_runs
  for insert to authenticated with check (private.has_permission(organization_id, 'ledger:post'));

create policy assets_select on public.assets
  for select to authenticated using (private.has_permission(organization_id, 'reports:read'));
create policy assets_insert on public.assets
  for insert to authenticated with check (private.has_permission(organization_id, 'ledger:post'));

create policy liabilities_select on public.liabilities
  for select to authenticated using (private.has_permission(organization_id, 'reports:read'));
create policy liabilities_insert on public.liabilities
  for insert to authenticated with check (private.has_permission(organization_id, 'ledger:post'));

create policy attachments_select on public.attachments
  for select to authenticated using (private.has_permission(organization_id, 'organizations:read'));
create policy attachments_insert on public.attachments
  for insert to authenticated with check (private.has_permission(organization_id, 'transactions:draft'));
