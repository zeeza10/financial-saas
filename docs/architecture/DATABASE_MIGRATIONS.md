# Database Migrations

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define how schema changes are written, reviewed, tested, applied and recovered, so changes are safe and ledger history is never rewritten.

**Related:** `DATABASE_SCHEMA.md`, `BACKUP_RECOVERY.md`, `RELEASE_CHECKLIST.md`, `AI_CHANGE_CONTROL.md`, `DEPLOYMENT.md`

## 1. Rules
1. All schema changes are SQL migration files in `supabase/migrations`, named with a timestamp and description. No manual changes to shared databases.
2. A migration that has been applied to staging or production is never edited; fix forward with a new migration.
3. Production migrations are applied by the CI/CD pipeline after human approval, never by an AI agent or a developer laptop.
4. Every new table must enable and force RLS and have policies, checked by an automated query in CI that fails if any public table lacks RLS.
5. Historic ledger rows are never modified by migrations. Data corrections are made with reversing entries through the posting function.

## 2. Migration header (required comment block)
```
-- Purpose:
-- Requirement/ADR:
-- Risk: low | medium | high   (locks, data loss, long run)
-- Rollback: down script | forward-fix | restore-from-PITR (state which and why)
-- Tested on: preview branch / staging (date)
```

## 3. Reversibility policy
| Change type | Recovery approach |
|---|---|
| Add table/column/index (nullable or default) | Down script drops it |
| Add NOT NULL, change type, rename | Expand/contract in several releases; no direct rename in production |
| Drop column/table | Only after two releases of no use, a verified backup, and explicit approval; recovery is restore |
| Data backfill | Batched, idempotent, with a before-snapshot table; recovery from snapshot |
| RLS/policy change | Down script restores previous policy; must pass the isolation suite before and after |

## 4. Safe change practice
- Set `lock_timeout` and `statement_timeout` in migrations; create indexes concurrently on large tables.
- Expand, then deploy code that writes both, backfill, switch reads, contract later.
- Each migration runs against a branch or disposable database with anonymized production-like data, then the full pgTAP, integration and regression suites.
- Verify a restore before any high-risk migration (`BACKUP_RECOVERY.md`).

## 5. Review
Migrations, RLS and posting functions require approval from a human code owner and a second reviewer for high risk (`AI_CHANGE_CONTROL.md`).
