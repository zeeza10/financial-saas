# ADR-0002: Multi-Tenancy with organization_id and RLS

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Record the tenant isolation strategy.

**Related:** `DATABASE_SCHEMA.md`, `AUTHORIZATION_RBAC_RLS.md`, `SECURITY_TEST_CASES.md`

**Status:** Proposed.
**Context:** One organization must never see another's financial data (cross-tenant leakage, IDOR, BOLA).
**Decision:** Shared database and schema; every tenant row has `organization_id`; RLS enabled and forced on all tenant tables; composite foreign keys; permission checks in SQL helper functions; the Worker also checks authorization (defense in depth). The service role is used only by cron and webhook jobs, never for user-driven reads, and always with an explicit organization filter.
**Alternatives:** schema-per-tenant (operational overhead, migrations multiply); database-per-tenant (cost, complexity at small scale).
**Consequences:** Cheapest to operate, but a policy bug affects all tenants, so isolation tests run on every release. Large enterprise customers may later need dedicated projects; revisit then.
