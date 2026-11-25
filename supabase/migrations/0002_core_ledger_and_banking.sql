-- Purpose: Phase 4 Core Financial Engine schema (Chart of Accounts, Periods, Gapless Journal Sequences, Immutable Double-Entry Ledger, Banking, Transfers, CSV Import, Reconciliation)
-- Requirement/ADR: FR-002..FR-009, FR-016, BR-001..BR-008, BR-013, BR-018, BR-020, BR-021, BR-022, OQ-026, ADR-0002, ADR-0003, ADR-0005
-- Risk: medium (new tables and immutable triggers; additive only)
-- Rollback: down script drops new tables and functions in reverse dependency order (pre-data only)
-- Tested on: pending local Supabase / CI pgTAP run

set lock_timeout = '5s';
set statement_timeout = '30s';

-- 1. Chart of Accounts (FR-002, BR-006, BR-008)
create table if not exists public.accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  code text not null check (code ~ '^[A-Za-z0-9_-]{2,20}$'),
  name text not null check (char_length(trim(name)) >= 2),
  account_type text not null check (account_type in ('asset', 'liability', 'equity', 'income', 'expense')),
  ownership_type text not null default 'business' check (ownership_type in ('business', 'personal')),
  is_system boolean not null default false,
  is_active boolean not null default true,
  parent_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, code),
  unique (organization_id, id),
  foreign key (organization_id, parent_id) references public.accounts(organization_id, id) on delete restrict
);

-- 2. Accounting Periods (FR-009, BR-004, BR-018)
create table if not exists public.accounting_periods (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  name text not null check (char_length(trim(name)) >= 2),
  start_date date not null,
  end_date date not null,
  status text not null default 'open' check (status in ('open', 'closed', 'locked')),
  tb_hash text,
  closed_by uuid,
  closed_at timestamptz,
  reopened_by uuid,
  reopened_reason text,
  reopened_at timestamptz,
  created_at timestamptz not null default now(),
  check (end_date >= start_date),
  unique (organization_id, id),
  unique (organization_id, start_date, end_date)
);

-- 3. Gapless per-organization entry numbering sequence (OQ-026)
create table if not exists public.org_entry_sequences (
  organization_id uuid primary key references public.organizations(id) on delete restrict,
  next_entry_no bigint not null default 1 check (next_entry_no >= 1)
);

-- 4. Journal Entries (FR-003, FR-004, BR-001, BR-003, BR-013, OQ-026)
create table if not exists public.journal_entries (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entry_no bigint,
  entry_date date not null,
  description text not null check (char_length(trim(description)) >= 2),
  kind text not null default 'standard' check (
    kind in ('standard', 'transfer', 'investor_capital', 'loan_proceeds', 'owner_contribution', 'owner_draw', 'reversal', 'distribution')
  ),
  status text not null default 'draft' check (status in ('draft', 'posted')),
  reverses_entry_id uuid,
  source text not null default 'manual',
  external_id text,
  fingerprint text,
  created_by uuid not null,
  posted_by uuid,
  posted_at timestamptz,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, reverses_entry_id) references public.journal_entries(organization_id, id) on delete restrict,
  check (
    (status = 'draft' and entry_no is null and posted_at is null and posted_by is null)
    or (status = 'posted' and entry_no is not null and posted_at is not null and posted_by is not null)
  )
);

create unique index if not exists idx_journal_entries_org_entry_no
  on public.journal_entries (organization_id, entry_no)
  where entry_no is not null;

create unique index if not exists idx_journal_entries_reverses_once
  on public.journal_entries (organization_id, reverses_entry_id)
  where reverses_entry_id is not null;

create unique index if not exists idx_journal_entries_external_id
  on public.journal_entries (organization_id, source, external_id)
  where external_id is not null;

-- 5. Journal Lines (BR-001, BR-002, BR-003)
create table if not exists public.journal_lines (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  entry_id uuid not null,
  line_no integer not null check (line_no >= 1),
  account_id uuid not null,
  party_id uuid,
  side text not null check (side in ('debit', 'credit')),
  amount_minor bigint not null check (amount_minor > 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  memo text,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, entry_id, line_no),
  foreign key (organization_id, entry_id) references public.journal_entries(organization_id, id) on delete restrict,
  foreign key (organization_id, account_id) references public.accounts(organization_id, id) on delete restrict,
  foreign key (organization_id, party_id) references public.parties(organization_id, id) on delete restrict
);

-- 6. Banking & Cash Accounts (FR-005, BR-006, DATA_PROTECTION.md last4 only)
create table if not exists public.bank_accounts (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  account_id uuid not null,
  institution text not null check (char_length(trim(institution)) >= 2),
  last4 char(4) not null check (last4 ~ '^\d{4}$'),
  ownership_type text not null check (ownership_type in ('business', 'personal')),
  opening_balance_minor bigint not null default 0,
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, account_id),
  foreign key (organization_id, account_id) references public.accounts(organization_id, id) on delete restrict
);

-- 7. Bank Transactions & CSV Imports (FR-006, BR-013)
create table if not exists public.bank_transactions (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  bank_account_id uuid not null,
  tx_date date not null,
  amount_minor bigint not null check (amount_minor <> 0),
  currency char(3) not null check (currency ~ '^[A-Z]{3}$'),
  description text not null check (char_length(trim(description)) >= 1),
  source text not null default 'csv_import',
  external_id text,
  fingerprint text not null,
  status text not null default 'ready' check (status in ('pending_review', 'ready', 'duplicate_held', 'posted', 'reconciled')),
  linked_entry_id uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, bank_account_id) references public.bank_accounts(organization_id, id) on delete restrict,
  foreign key (organization_id, linked_entry_id) references public.journal_entries(organization_id, id) on delete restrict
);

create unique index if not exists idx_bank_tx_external_id
  on public.bank_transactions (organization_id, source, external_id)
  where external_id is not null;

create index if not exists idx_bank_tx_fingerprint
  on public.bank_transactions (organization_id, bank_account_id, fingerprint);

-- 8. Bank Reconciliations (FR-016, BR-020, FT-27)
create table if not exists public.reconciliations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  bank_account_id uuid not null,
  statement_date date not null,
  statement_ending_balance_minor bigint not null,
  status text not null default 'in_progress' check (status in ('in_progress', 'completed')),
  locked_at timestamptz,
  completed_by uuid,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  foreign key (organization_id, bank_account_id) references public.bank_accounts(organization_id, id) on delete restrict
);

create table if not exists public.reconciliation_matches (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete restrict,
  reconciliation_id uuid not null,
  bank_transaction_id uuid not null,
  journal_entry_id uuid not null,
  created_at timestamptz not null default now(),
  unique (organization_id, id),
  unique (organization_id, bank_transaction_id),
  unique (organization_id, journal_entry_id),
  foreign key (organization_id, reconciliation_id) references public.reconciliations(organization_id, id) on delete restrict,
  foreign key (organization_id, bank_transaction_id) references public.bank_transactions(organization_id, id) on delete restrict,
  foreign key (organization_id, journal_entry_id) references public.journal_entries(organization_id, id) on delete restrict
);

-- Indexes (DATABASE_SCHEMA.md §7)
create index if not exists idx_accounts_org on public.accounts (organization_id, code);
create index if not exists idx_periods_org on public.accounting_periods (organization_id, start_date, end_date);
create index if not exists idx_journal_entries_org_date on public.journal_entries (organization_id, entry_date);
create index if not exists idx_journal_lines_org_entry on public.journal_lines (organization_id, entry_id);
create index if not exists idx_journal_lines_org_acc on public.journal_lines (organization_id, account_id);

-- 9. Ledger Immutability Triggers & Revoked Privileges (BR-003, BR-022, FT-20, ADR-0005)
create or replace function private.forbid_posted_entry_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.status = 'posted' then
    raise exception 'BR-003/FT-20: Posted journal entries are immutable; create a reversal entry instead';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_journal_entries_immutable on public.journal_entries;
create trigger trg_journal_entries_immutable
  before update or delete on public.journal_entries
  for each row execute function private.forbid_posted_entry_mutation();

create or replace function private.forbid_posted_line_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_status text;
begin
  select je.status into v_status
  from public.journal_entries je
  where je.organization_id = old.organization_id
    and je.id = old.entry_id;

  if v_status = 'posted' then
    raise exception 'BR-003/FT-20: Lines of posted journal entries are immutable';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_journal_lines_immutable on public.journal_lines;
create trigger trg_journal_lines_immutable
  before update or delete on public.journal_lines
  for each row execute function private.forbid_posted_line_mutation();

revoke truncate on public.journal_entries, public.journal_lines from public, anon, authenticated, service_role;

-- 10. Account-Type Compatibility Helper (BR-005, BR-008)
create or replace function private.is_account_compatible(p_kind text, p_account_type text)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select case p_kind
    when 'standard' then true
    when 'reversal' then true
    when 'transfer' then p_account_type in ('asset', 'liability')
    when 'investor_capital' then p_account_type in ('asset', 'equity', 'liability', 'expense')
    when 'loan_proceeds' then p_account_type in ('asset', 'liability', 'equity')
    when 'owner_contribution' then p_account_type in ('asset', 'liability', 'equity')
    when 'owner_draw' then p_account_type in ('asset', 'equity')
    when 'distribution' then p_account_type in ('equity', 'liability', 'asset')
    else false
  end;
$$;

-- 11. Atomic Posting, Reversal, and Period Control RPCs (ADR-0003)
create or replace function public.rpc_post_journal_entry(
  p_org_id uuid,
  p_entry_id uuid,
  p_request_id text default 'rpc'
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_entry record;
  v_base_currency char(3);
  v_period_status text;
  v_line_count integer;
  v_debit_sum bigint;
  v_credit_sum bigint;
  v_bad_line integer;
  v_entry_no bigint;
begin
  if not private.has_permission(p_org_id, 'ledger:post') then
    raise exception 'Forbidden: ledger:post required';
  end if;

  select * into v_entry
  from public.journal_entries je
  where je.organization_id = p_org_id and je.id = p_entry_id
  for update;

  if not found then
    raise exception 'Journal entry not found';
  end if;
  if v_entry.status = 'posted' then
    return v_entry.entry_no;
  end if;

  select o.base_currency into v_base_currency
  from public.organizations o
  where o.id = p_org_id;

  -- BR-004: Period check (entry_date must fall inside an open period if periods are defined, and never inside closed/locked)
  select p.status into v_period_status
  from public.accounting_periods p
  where p.organization_id = p_org_id
    and v_entry.entry_date between p.start_date and p.end_date
  limit 1;

  if v_period_status is not null and v_period_status <> 'open' then
    raise exception 'BR-004: Cannot post into a % accounting period', v_period_status;
  end if;

  -- BR-001: Line count, positive amounts, base currency, debit = credit
  select
    count(*),
    coalesce(sum(case when l.side = 'debit' then l.amount_minor else 0 end), 0),
    coalesce(sum(case when l.side = 'credit' then l.amount_minor else 0 end), 0)
  into v_line_count, v_debit_sum, v_credit_sum
  from public.journal_lines l
  where l.organization_id = p_org_id and l.entry_id = p_entry_id;

  if v_line_count < 2 then
    raise exception 'BR-001: Journal entry must have at least two lines';
  end if;
  if v_debit_sum <> v_credit_sum or v_debit_sum <= 0 then
    raise exception 'BR-001: Entry is unbalanced (debits=%, credits=%)', v_debit_sum, v_credit_sum;
  end if;

  -- Currency and account compatibility checks (BR-001, BR-008)
  select count(*) into v_bad_line
  from public.journal_lines l
  join public.accounts a on a.organization_id = l.organization_id and a.id = l.account_id
  where l.organization_id = p_org_id
    and l.entry_id = p_entry_id
    and (
      l.currency <> v_base_currency
      or not a.is_active
      or not private.is_account_compatible(v_entry.kind, a.account_type)
    );

  if v_bad_line > 0 then
    raise exception 'BR-001/BR-008: Invalid line currency, inactive account, or incompatible account type';
  end if;

  -- OQ-026: Gapless per-organization entry number under row lock
  insert into public.org_entry_sequences (organization_id, next_entry_no)
  values (p_org_id, 1)
  on conflict (organization_id) do nothing;

  select next_entry_no into v_entry_no
  from public.org_entry_sequences
  where organization_id = p_org_id
  for update;

  update public.org_entry_sequences
  set next_entry_no = v_entry_no + 1
  where organization_id = p_org_id;

  update public.journal_entries
  set status = 'posted',
      entry_no = v_entry_no,
      posted_by = v_uid,
      posted_at = now()
  where organization_id = p_org_id and id = p_entry_id;

  perform private.append_audit_event(
    p_org_id,
    v_uid,
    'user',
    'journal.posted',
    'journal_entry',
    p_entry_id::text,
    null,
    jsonb_build_object('entry_no', v_entry_no, 'total_minor', v_debit_sum),
    p_request_id
  );

  insert into public.outbox_events (organization_id, event_type, payload)
  values (p_org_id, 'journal.posted', jsonb_build_object('entry_id', p_entry_id, 'entry_no', v_entry_no));

  return v_entry_no;
end;
$$;

revoke all on function public.rpc_post_journal_entry(uuid, uuid, text) from public;
grant execute on function public.rpc_post_journal_entry(uuid, uuid, text) to authenticated;

create or replace function public.rpc_reverse_journal_entry(
  p_org_id uuid,
  p_entry_id uuid,
  p_reason text,
  p_reversal_date date default current_date,
  p_request_id text default 'rpc'
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_orig record;
  v_rev_id uuid := gen_random_uuid();
begin
  if not private.has_permission(p_org_id, 'ledger:post') then
    raise exception 'Forbidden: ledger:post required';
  end if;

  select * into v_orig
  from public.journal_entries je
  where je.organization_id = p_org_id and je.id = p_entry_id
  for update;

  if not found or v_orig.status <> 'posted' then
    raise exception 'BR-003: Only posted journal entries can be reversed';
  end if;

  insert into public.journal_entries (
    id, organization_id, entry_date, description, kind, status, reverses_entry_id, source, created_by
  ) values (
    v_rev_id,
    p_org_id,
    coalesce(p_reversal_date, current_date),
    'Reversal of #' || v_orig.entry_no || ': ' || trim(p_reason),
    'reversal',
    'draft',
    p_entry_id,
    'reversal',
    v_uid
  );

  insert into public.journal_lines (
    organization_id, entry_id, line_no, account_id, party_id, side, amount_minor, currency, memo
  )
  select
    l.organization_id,
    v_rev_id,
    l.line_no,
    l.account_id,
    l.party_id,
    case when l.side = 'debit' then 'credit' else 'debit' end,
    l.amount_minor,
    l.currency,
    l.memo
  from public.journal_lines l
  where l.organization_id = p_org_id and l.entry_id = p_entry_id
  order by l.line_no;

  perform public.rpc_post_journal_entry(p_org_id, v_rev_id, p_request_id);

  perform private.append_audit_event(
    p_org_id,
    v_uid,
    'user',
    'journal.reversed',
    'journal_entry',
    v_rev_id::text,
    null,
    jsonb_build_object('reverses_entry_id', p_entry_id, 'reason', trim(p_reason)),
    p_request_id
  );

  return v_rev_id;
end;
$$;

revoke all on function public.rpc_reverse_journal_entry(uuid, uuid, text, date, text) from public;
grant execute on function public.rpc_reverse_journal_entry(uuid, uuid, text, date, text) to authenticated;

create or replace function public.rpc_close_period(
  p_org_id uuid,
  p_period_id uuid,
  p_request_id text default 'rpc'
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_uid uuid := (select auth.uid());
  v_period record;
  v_debits bigint;
  v_credits bigint;
  v_tb_hash text;
begin
  if not private.has_permission(p_org_id, 'period:close') then
    raise exception 'Forbidden: period:close required';
  end if;

  select * into v_period
  from public.accounting_periods p
  where p.organization_id = p_org_id and p.id = p_period_id
  for update;

  if not found or v_period.status <> 'open' then
    raise exception 'Period not open';
  end if;

  select
    coalesce(sum(case when l.side = 'debit' then l.amount_minor else 0 end), 0),
    coalesce(sum(case when l.side = 'credit' then l.amount_minor else 0 end), 0)
  into v_debits, v_credits
  from public.journal_lines l
  join public.journal_entries e on e.organization_id = l.organization_id and e.id = l.entry_id
  join public.accounts a on a.organization_id = l.organization_id and a.id = l.account_id
  where l.organization_id = p_org_id
    and e.status = 'posted'
    and e.entry_date <= v_period.end_date
    and a.ownership_type = 'business';

  if v_debits <> v_credits then
    raise exception 'BR-018: Trial Balance is unbalanced at period close';
  end if;

  v_tb_hash := encode(extensions.digest(p_org_id::text || '|' || p_period_id::text || '|' || v_debits::text, 'sha256'), 'hex');

  update public.accounting_periods
  set status = 'closed',
      tb_hash = v_tb_hash,
      closed_by = v_uid,
      closed_at = now()
  where organization_id = p_org_id and id = p_period_id;

  perform private.append_audit_event(
    p_org_id,
    v_uid,
    'user',
    'period.closed',
    'accounting_period',
    p_period_id::text,
    null,
    jsonb_build_object('tb_hash', v_tb_hash, 'total_minor', v_debits),
    p_request_id
  );

  return v_tb_hash;
end;
$$;

revoke all on function public.rpc_close_period(uuid, uuid, text) from public;
grant execute on function public.rpc_close_period(uuid, uuid, text) to authenticated;

create or replace function public.rpc_reopen_period(
  p_org_id uuid,
  p_period_id uuid,
  p_reason text,
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
  if not private.has_permission(p_org_id, 'period:reopen') then
    raise exception 'BR-004: Only Owner (period:reopen) may reopen a closed period';
  end if;
  if p_reason is null or char_length(trim(p_reason)) < 10 then
    raise exception 'BR-004: Reopening a period requires a written reason';
  end if;

  update public.accounting_periods
  set status = 'open',
      reopened_by = v_uid,
      reopened_reason = trim(p_reason),
      reopened_at = now()
  where organization_id = p_org_id and id = p_period_id and status = 'closed';

  if not found then
    raise exception 'Closed period not found';
  end if;

  perform private.append_audit_event(
    p_org_id,
    v_uid,
    'user',
    'period.reopened',
    'accounting_period',
    p_period_id::text,
    null,
    jsonb_build_object('reason', trim(p_reason)),
    p_request_id
  );
end;
$$;

revoke all on function public.rpc_reopen_period(uuid, uuid, text, text) from public;
grant execute on function public.rpc_reopen_period(uuid, uuid, text, text) to authenticated;

-- 12. Enable and FORCE RLS on all 9 new public tables (ADR-0002)
alter table public.accounts enable row level security;
alter table public.accounts force row level security;

alter table public.accounting_periods enable row level security;
alter table public.accounting_periods force row level security;

alter table public.org_entry_sequences enable row level security;
alter table public.org_entry_sequences force row level security;

alter table public.journal_entries enable row level security;
alter table public.journal_entries force row level security;

alter table public.journal_lines enable row level security;
alter table public.journal_lines force row level security;

alter table public.bank_accounts enable row level security;
alter table public.bank_accounts force row level security;

alter table public.bank_transactions enable row level security;
alter table public.bank_transactions force row level security;

alter table public.reconciliations enable row level security;
alter table public.reconciliations force row level security;

alter table public.reconciliation_matches enable row level security;
alter table public.reconciliation_matches force row level security;

-- Policies
create policy accounts_select on public.accounts
  for select to authenticated using (private.has_permission(organization_id, 'accounts:read'));
create policy accounts_insert on public.accounts
  for insert to authenticated with check (private.has_permission(organization_id, 'accounts:write'));
create policy accounts_update on public.accounts
  for update to authenticated
  using (private.has_permission(organization_id, 'accounts:write'))
  with check (private.has_permission(organization_id, 'accounts:write'));

create policy periods_select on public.accounting_periods
  for select to authenticated using (private.has_permission(organization_id, 'reports:read'));
create policy periods_insert on public.accounting_periods
  for insert to authenticated with check (private.has_permission(organization_id, 'period:close'));

-- org_entry_sequences: no direct authenticated select/insert/update (managed strictly by rpc_post_journal_entry)

create policy journal_entries_select on public.journal_entries
  for select to authenticated using (private.has_permission(organization_id, 'reports:read'));
create policy journal_entries_insert on public.journal_entries
  for insert to authenticated with check (private.has_permission(organization_id, 'ledger:draft') and status = 'draft');

create policy journal_lines_select on public.journal_lines
  for select to authenticated using (private.has_permission(organization_id, 'reports:read'));
create policy journal_lines_insert on public.journal_lines
  for insert to authenticated with check (private.has_permission(organization_id, 'ledger:draft'));

create policy bank_accounts_select on public.bank_accounts
  for select to authenticated using (private.has_permission(organization_id, 'banking:read'));
create policy bank_accounts_insert on public.bank_accounts
  for insert to authenticated with check (private.has_permission(organization_id, 'banking:write'));

create policy bank_tx_select on public.bank_transactions
  for select to authenticated using (private.has_permission(organization_id, 'banking:read'));
create policy bank_tx_insert on public.bank_transactions
  for insert to authenticated with check (private.has_permission(organization_id, 'transactions:import'));

create policy reconciliations_select on public.reconciliations
  for select to authenticated using (private.has_permission(organization_id, 'banking:read'));
create policy reconciliations_insert on public.reconciliations
  for insert to authenticated with check (private.has_permission(organization_id, 'banking:write'));

create policy rec_matches_select on public.reconciliation_matches
  for select to authenticated using (private.has_permission(organization_id, 'banking:read'));
create policy rec_matches_insert on public.reconciliation_matches
  for insert to authenticated with check (private.has_permission(organization_id, 'banking:write'));
