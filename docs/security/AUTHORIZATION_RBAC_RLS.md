# Authorization: RBAC and Row Level Security

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define how permissions and tenant isolation are enforced in both the API and the database.

**Related:** `USER_ROLES.md`, `DATABASE_SCHEMA.md`, `ADR-0002-tenancy-rls.md`, `THREAT_MODEL.md`, `SECURITY_TEST_CASES.md`

## 1. Layers (all must pass)
1. **API layer:** authenticate, load membership, check permission from the catalog, validate input.
2. **Database function layer:** posting and sensitive functions re-check permission and organization.
3. **RLS layer:** policies restrict every read and write to rows of organizations where the user holds the needed permission.
4. **Constraints and triggers:** composite FKs, immutability, balance checks.
A failure in one layer must not expose data because another layer still blocks it.

## 2. Permission catalog
One source of truth (`packages/contracts`) lists permissions (`ledger:post`, `period:reopen`, ...) and the role-to-permission map from `USER_ROLES.md`. SQL helper data and TypeScript checks are generated from it; a CI test fails if they drift.

## 3. RLS requirements
- RLS enabled and forced on every table in an exposed schema; default deny.
- Policies use `private.has_permission(organization_id, 'perm')`; wrap `auth.uid()` as `(select auth.uid())` for performance.
- `SECURITY DEFINER` functions set `search_path = ''`, live in `private`, and are never directly executable by `anon`; revoke `PUBLIC` execute by default.
- Separate policies for select, insert, update, delete. Ledger tables get no update/delete policies at all.
- Policies never trust client-supplied `organization_id` without membership check; `WITH CHECK` mirrors `USING`.
- Views must be `security_invoker` so RLS of the caller applies (verify option for the Postgres version in use).
- Storage/R2 access always goes through the API with an organization-prefixed key and a short-lived signed URL.

## 4. Service role rules
Allowed only for: scheduled jobs, webhook receivers, and migrations. Each use is listed in an approved register, includes an explicit `organization_id` filter, and is covered by a test that proves it does not cross tenants. Never in the browser, never for user-driven reads. **The user-facing API Worker must not hold the service role key at all.** Jobs and webhook receivers run as a separate Worker with its own secrets and its own permissions, so a bug in request handling cannot reach a key that bypasses RLS.

## 4a. Direct Data API access (assume it can happen)
The browser is designed to talk only to the Worker, but any user can extract their own JWT and call the database's HTTP API directly. Therefore: expose only the schemas that are needed; revoke table privileges that the API role does not need; and design every RLS policy and database function so that a direct call with a valid user JWT cannot do more than the Worker would allow. Business rules that matter (balance, immutability, period, permissions) are in the database for this reason.

## 5. IDOR/BOLA rules
Object ids are never sufficient; the lookup is always `(organization_id, id)`. Foreign or missing ids return 404.

## 6. Cross-tenant tests (mandatory each release)
Two or more canary organizations with similar data. For every table and every endpoint: user A cannot read, insert, update, delete or reference B's rows; the suite is generated from the table list so new tables cannot be forgotten (`SECURITY_TEST_CASES.md` ST-05, ST-09).

## 7. Sensitive operations
Posting, reversal, close/reopen, role changes, agreement changes, exports, API keys: permission + re-authentication where noted + audit event (BR-021).
