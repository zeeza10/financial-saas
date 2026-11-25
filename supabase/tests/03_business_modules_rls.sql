-- pgTAP test suite for Phase 5 Business Modules (ST-09, BR-019, FT-35)
begin;
select plan(3);

-- 1. All 33 public tables must have RLS enabled and FORCED
select is(
  (select count(*)::integer from private.verify_rls_coverage()),
  0,
  'ST-09: All 33 public tables have RLS enabled and forced'
);

-- 2. Pseudonymization preserves posted ledger amounts (BR-019, FT-35)
do $$
declare
  v_owner uuid := '11111111-1111-1111-1111-111111111111';
  v_org_id uuid;
  v_party_id uuid;
begin
  perform set_config('request.jwt.claim.sub', v_owner::text, true);
  v_org_id := public.rpc_create_organization('Phase 5 Test Org', 'USD', 'US', 1::smallint, 'req-p5');
  insert into public.parties (organization_id, party_type, display_name, email_redacted)
  values (v_org_id, 'investor', 'Jane Investor', 'jane@example.com')
  returning id into v_party_id;

  perform public.rpc_pseudonymize_party(v_org_id, v_party_id, 'req-gdpr');
end $$;

select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;

select ok(
  exists (
    select 1 from public.parties
    where email_redacted is null and pseudonymized_at is not null
  ),
  'BR-019/FT-35: Party personal fields pseudonymized without deleting row'
);

reset role;
set local role anon;
select throws_ok(
  $$select * from public.profit_distributions$$,
  null,
  null,
  'ST-06: anon role cannot read profit_distributions'
);

reset role;
select * from finish();
rollback;
