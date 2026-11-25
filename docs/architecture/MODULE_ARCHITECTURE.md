# Module Architecture

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define how the code is split into modules, the dependency rules between them, and the checklist for adding a module without breaking others.

**Related:** `ARCHITECTURE.md`, `API_SPECIFICATION.md`, `CHANGE_MANAGEMENT.md`, `AI_CODING_RULES.md`, `ROADMAP.md`

## 1. Repository layout (proposed)
```
apps/web            React + TypeScript UI
apps/api            Cloudflare Worker (HTTP layer only)
packages/contracts  Zod schemas + OpenAPI (shared types, versioned)
packages/ledger-core  Pure domain logic: money, posting rules, validation
modules/<name>      Feature module: routes, services, repository, tests
supabase/migrations SQL migrations (human-approved)
supabase/tests      pgTAP tests (RLS, ledger)
docs/               This documentation
```

## 2. Module rules
1. A module exposes a small public interface (`index.ts`); nothing else is imported from outside.
2. **Only the `ledger` module writes to ledger tables.** Other modules request postings through its interface (for example, Payroll asks Ledger to post a salary accrual).
3. Modules do not read another module's tables directly; they use its interface or consume events from the `outbox_events` table.
4. Shared code lives in `contracts` and `ledger-core` only. No duplicate business logic (one place per rule, cited by BR id).
5. Boundaries are enforced by lint/dependency rules in CI (for example dependency-cruiser or ESLint boundaries).
6. Each module declares: name, version, required permissions, owned tables, events published/consumed, feature flag key.

## 3. Module dependency (initial)
`ledger-core` <- `ledger` <- (`banking`, `expenses`, `reports`, `payables`, `investors`, `profit-sharing`, `payroll`, `assets`) ; `audit` and `auth/tenancy` are platform modules used by all.

## 4. Events
Modules publish domain events (for example `journal.posted`, `period.closed`) to an outbox written in the same transaction as the state change. Consumers are idempotent and carry `organization_id`.

## 5. Feature flags
Each new module ships behind a flag, default off, enabled per organization after tests pass. Flags never gate security checks.

## 6. Checklist for adding a module
1. Write or update PRD/SRS requirement IDs and any new business rules (`BUSINESS_RULES.md`).
2. Add an ADR if it changes architecture.
3. Define tables with `organization_id`, RLS, composite FKs, and pgTAP tests.
4. Define permissions in the permission catalog and update `USER_ROLES.md`.
5. Add API endpoints under the current `/v1` without changing existing contracts.
6. Add unit, integration, security and (if financial) property tests; run the full regression suite.
7. Add a migration with rollback/recovery plan (`DATABASE_MIGRATIONS.md`).
8. Update `CHANGELOG.md`, `DOCUMENTATION_STATUS.md`, `USER_GUIDE.md`.
9. Ship behind a feature flag; staged rollout.

## 7. Backward compatibility
Additive changes only inside a version. Removal or semantic change needs a new API version or an expand/contract migration with a deprecation window (`API_SPECIFICATION.md`).
