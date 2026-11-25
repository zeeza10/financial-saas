# Integration Testing

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define how the API, database functions, RLS and external boundaries are tested together.

**Related:** `TESTING_STRATEGY.md`, `SECURITY_TEST_CASES.md`, `DATABASE_MIGRATIONS.md`, `API_SPECIFICATION.md`

## 1. Database tests (pgTAP)
- Every table: RLS enabled and forced; policies exist; anon has no access.
- Isolation: for each tenant table, user of org A cannot select/insert/update/delete/reference org B rows (generated from the catalog of tables).
- Ledger: update/delete on posted entries and lines fail; unbalanced entry cannot post; closed-period posting fails; double reversal fails; privileges revoked as designed.
- Posting function: concurrent calls with the same idempotency key produce one entry.
- Audit: each sensitive function writes exactly one audit event; hash chain verifies; deleting or editing audit rows fails.

## 2. API integration tests
Run the Worker locally against a local database with real RLS (not the service role):
- Authentication and CSRF handling, role matrix per endpoint (generated from the permission catalog), validation errors, problem+json shape, pagination, rate limit, idempotency replay.
- Contract tests: responses match the OpenAPI generated from `contracts`; breaking-change diff against the last release.

## 3. External boundaries
Supabase Auth, R2, email, and eBay are replaced by fakes in CI; contract tests against sandbox versions run on a schedule. Webhook signature and replay tests.

## 4. Migration tests
Apply all migrations to an empty database and to a snapshot of the previous release with anonymized data; run the suites before and after; test rollback or forward-fix steps stated in the migration header.

## 5. Isolation of runs
Each run gets a fresh database; fixtures create canary organizations; no shared state between tests.
