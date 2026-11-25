# Backup and Disaster Recovery

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define backup scope, recovery objectives, restore procedures and drills for the database and files.

**Related:** `DATABASE_MIGRATIONS.md`, `INCIDENT_RESPONSE.md`, `DEPLOYMENT.md`, `OPEN_QUESTIONS.md`, `MONITORING.md`

## 1. Objectives (proposed, not yet approved: OQ-016)
RPO 15 minutes, RTO 4 hours for the production database. Files (R2): RPO 24 hours. These need a Supabase plan with point-in-time recovery; verify availability and cost before committing.

## 2. What is backed up
| Asset | Method | Frequency | Retention |
|---|---|---|---|
| Postgres | Provider PITR plus daily backups | Continuous / daily | 7-30 days (plan dependent) |
| Postgres logical export | `pg_dump` of schema and data to encrypted storage in a separate account/region | Daily | 30 days |
| R2 files | Versioning plus replication or periodic copy to separate account | Daily | 30 days |
| Configuration and IaC | In Git | Every change | Permanent |
| Secrets | Not backed up in Git; recorded in a secure vault with recovery procedure | On change | n/a |

Backups are encrypted, access restricted, and stored separately from the primary account so one compromise cannot delete both.

## 3. Restore procedures
1. Declare the incident and freeze writes (maintenance mode).
2. Choose the restore point (before corruption or tampering).
3. Restore into a **new** project/instance, not over production.
4. Run verification: schema version, row counts, Trial Balance balanced per organization, audit hash chain valid, cross-tenant test suite, sample reconciliations.
5. Repoint the API (secrets/config), run smoke tests, lift maintenance mode.
6. Reconcile data lost between restore point and incident using imports and audit logs; communicate with customers.

## 4. Per-tenant recovery
The ledger is append-only, so a single tenant's mistaken data is normally fixed by reversal entries, not restore. A tenant-level restore needs an export of that organization from a restored copy; the procedure must be written and tested before launch.

## 5. Drills
Quarterly restore drill with timing recorded against RTO/RPO; results stored with the operations records and reviewed. An untested backup is treated as not existing.

## 6. Related risks
Migrations and bulk data changes require a verified recent backup first (`DATABASE_MIGRATIONS.md`). Ransomware or insider deletion: separate-account backups and restricted delete rights.
