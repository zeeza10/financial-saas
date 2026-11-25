-- pgTAP test suite for Phase 4 Core Financial Engine (FT-01..FT-04, FT-20..FT-24, OQ-026, ST-09, ST-16)
begin;
select plan(8);

-- 1. All public tables (now 21) must have RLS enabled and FORCED
select is(
  (select count(*)::integer from private.verify_rls_coverage()),
  0,
  'ST-09: All Phase 4 public tables have RLS enabled and forced'
);

do $$
declare
  v_owner uuid := '11111111-1111-1111-1111-111111111111';
  v_org_id uuid;
  v_bank_id uuid;
  v_sales_id uuid;
  v_period_id uuid;
  v_entry_id uuid;
  v_unbal_id uuid;
  v_rev_id uuid;
begin
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_org_id := public.rpc_create_organization('Ledger Test Org', 'USD', 'US', 1::smallint, 'req-ledger-1');

  insert into public.accounts (organization_id, code, name, account_type, ownership_type, is_system)
  values (v_org_id, '1000', 'Business Bank', 'asset', 'business', true)
  returning id into v_bank_id;

  insert into public.accounts (organization_id, code, name, account_type, ownership_type, is_system)
  values (v_org_id, '4000', 'Sales', 'income', 'business', true)
  returning id into v_sales_id;

  insert into public.accounting_periods (organization_id, name, start_date, end_date, status)
  values (v_org_id, 'Jan 2026', '2026-01-01', '2026-01-31', 'open')
  returning id into v_period_id;

  -- Balanced entry (FT-01)
  insert into public.journal_entries (organization_id, entry_date, description, kind, status, created_by)
  values (v_org_id, '2026-01-15', 'eBay sale', 'standard', 'draft', v_owner)
  returning id into v_entry_id;

  insert into public.journal_lines (organization_id, entry_id, line_no, account_id, side, amount_minor, currency) values
    (v_org_id, v_entry_id, 1, v_bank_id, 'debit', 10000, 'USD'),
    (v_org_id, v_entry_id, 2, v_sales_id, 'credit', 10000, 'USD');

  perform public.rpc_post_journal_entry(v_org_id, v_entry_id, 'req-post-1');

  -- Reversal (FT-21)
  v_rev_id := public.rpc_reverse_journal_entry(v_org_id, v_entry_id, 'Customer refund correction', '2026-01-16', 'req-rev-1');
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

-- 2. Gapless entry numbers 1 and 2 assigned (OQ-026)
select is(
  (select array_agg(entry_no order by entry_no) from public.journal_entries),
  array[1::bigint, 2::bigint],
  'OQ-026: Gapless per-org entry numbers assigned on post'
);

-- 3. Posted entry cannot be updated or deleted (FT-20, BR-003)
select throws_ok(
  $$update public.journal_entries set description = 'tampered' where entry_no = 1$$,
  null,
  null,
  'FT-20: Updating posted journal_entries fails'
);

select throws_ok(
  $$delete from public.journal_lines$$,
  null,
  null,
  'FT-20: Deleting posted journal_lines fails'
);

-- 4. Double reversal fails (FT-22)
select throws_ok(
  $$select public.rpc_reverse_journal_entry((select id from public.organizations limit 1), (select id from public.journal_entries where entry_no = 1), 'second reversal', '2026-01-17', 'req-rev-2')$$,
  null,
  null,
  'FT-22: Double reversal of the same entry is rejected'
);

-- 5. Unbalanced entry fails (FT-02)
select throws_ok(
  $$
  do $t$
  declare v_org uuid; v_e uuid; v_b uuid; v_s uuid;
  begin
    select id into v_org from public.organizations limit 1;
    select id into v_b from public.accounts where code = '1000';
    select id into v_s from public.accounts where code = '4000';
    insert into public.journal_entries (organization_id, entry_date, description, created_by)
    values (v_org, '2026-01-18', 'Unbalanced', '11111111-1111-1111-1111-111111111111') returning id into v_e;
    insert into public.journal_lines (organization_id, entry_id, line_no, account_id, side, amount_minor, currency) values
      (v_org, v_e, 1, v_b, 'debit', 10000, 'USD'),
      (v_org, v_e, 2, v_s, 'credit', 9999, 'USD');
    perform public.rpc_post_journal_entry(v_org, v_e, 'req-unbal');
  end $t$;
  $$,
  null,
  null,
  'FT-02: Unbalanced journal entry rejected by DB RPC'
);

-- 6. Close period succeeds and blocks subsequent posting (FT-23)
select ok(
  length(public.rpc_close_period((select id from public.organizations limit 1), (select id from public.accounting_periods limit 1), 'req-close')) = 64,
  'BR-004: Period closes with SHA-256 Trial Balance hash'
);

select throws_ok(
  $$
  do $t$
  declare v_org uuid; v_e uuid; v_b uuid; v_s uuid;
  begin
    select id into v_org from public.organizations limit 1;
    select id into v_b from public.accounts where code = '1000';
    select id into v_s from public.accounts where code = '4000';
    insert into public.journal_entries (organization_id, entry_date, description, created_by)
    values (v_org, '2026-01-20', 'Backdated', '11111111-1111-1111-1111-111111111111') returning id into v_e;
    insert into public.journal_lines (organization_id, entry_id, line_no, account_id, side, amount_minor, currency) values
      (v_org, v_e, 1, v_b, 'debit', 500, 'USD'),
      (v_org, v_e, 2, v_s, 'credit', 500, 'USD');
    perform public.rpc_post_journal_entry(v_org, v_e, 'req-closed');
  end $t$;
  $$,
  null,
  null,
  'FT-23: Posting into closed period rejected'
);

reset role;
select * from finish();
rollback;
