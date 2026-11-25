-- pgTAP test suite for Phase 3 foundation (ST-05, ST-06, ST-08, ST-09, ST-17)
-- Requires pgTAP extension enabled on local/CI test database.

begin;
select plan(9);

-- 1. Every public table must have RLS enabled and FORCED (DATABASE_MIGRATIONS.md)
select is(
  (select count(*)::integer from private.verify_rls_coverage()),
  0,
  'ST-09: All public tables have RLS enabled and forced'
);

-- 2. Canary organizations setup (3 canary organizations per TESTING_STRATEGY.md)
do $$
declare
  v_user_a uuid := '11111111-1111-1111-1111-111111111111';
  v_user_b uuid := '22222222-2222-2222-2222-222222222222';
  v_user_c uuid := '33333333-3333-3333-3333-333333333333';
begin
  perform set_config('request.jwt.claim.sub', v_user_a::text, true);
  perform public.rpc_create_organization('Canary Org Alpha', 'USD', 'US', 1::smallint, 'req-a');

  perform set_config('request.jwt.claim.sub', v_user_b::text, true);
  perform public.rpc_create_organization('Canary Org Beta', 'USD', 'US', 1::smallint, 'req-b');

  perform set_config('request.jwt.claim.sub', v_user_c::text, true);
  perform public.rpc_create_organization('Canary Org Gamma', 'GBP', 'GB', 4::smallint, 'req-c');
end $$;

-- 3. User A sees only Canary Org Alpha (ST-09 cross-tenant isolation)
select set_config('request.jwt.claim.sub', '11111111-1111-1111-1111-111111111111', true);
set local role authenticated;
select is(
  (select count(*)::integer from public.organizations),
  1,
  'ST-09: Authenticated user sees only their own organization'
);
select is(
  (select name from public.organizations limit 1),
  'Canary Org Alpha',
  'ST-09: Returned organization matches User A membership'
);

-- 4. User A cannot read Beta audit_events (ST-05/ST-09)
select is(
  (select count(*)::integer from public.audit_events where payload_json->>'name' = 'Canary Org Beta'),
  0,
  'ST-09: User A cannot read Org Beta audit_events'
);

-- 5. Hash chain verifies for User A org (ST-17)
select ok(
  public.rpc_verify_audit_chain((select id from public.organizations where name = 'Canary Org Alpha')),
  'ST-17: Audit event hash chain verifies'
);

-- 6. Updating or deleting audit_events fails (ST-17)
select throws_ok(
  $$delete from public.audit_events$$,
  null,
  null,
  'ST-17: Authenticated role cannot delete audit_events'
);

-- 7. Removing last Owner fails (ST-08)
select throws_ok(
  $$delete from public.org_members where role = 'owner'$$,
  null,
  null,
  'ST-08: Last active Owner cannot be deleted'
);

-- 8. Anon role cannot read organizations or audit_events (ST-06)
reset role;
set local role anon;
select throws_ok(
  $$select * from public.organizations$$,
  null,
  null,
  'ST-06: anon role has no read access to organizations'
);
select throws_ok(
  $$select * from public.audit_events$$,
  null,
  null,
  'ST-06: anon role has no read access to audit_events'
);

reset role;
select * from finish();
rollback;
