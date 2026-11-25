# Database Schema (Design)

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Specify the logical database design, tenant isolation pattern, and ledger integrity mechanisms. This is a design document; no migration has been written or applied.

**Related:** `ACCOUNTING_MODEL.md`, `BUSINESS_RULES.md`, `AUTHORIZATION_RBAC_RLS.md`, `DATABASE_MIGRATIONS.md`, `ADR-0002-tenancy-rls.md`, `ADR-0005-ledger-immutability.md`

## 1. Conventions
- Primary keys: `uuid` (v7 or random). Timestamps: `timestamptz`. Money: `bigint` minor units + `currency char(3)` (BR-002).
- Every tenant table has `organization_id uuid not null`, an index on it, and RLS enabled **and forced**.
- Cross-table references use composite keys `(organization_id, id)` so a row can never point at another tenant's row.
- Internal functions live in schema `private` (not exposed by the API layer).
- Names: snake_case, plural tables.

## 2. Tables
| Group | Table | Key columns / notes |
|---|---|---|
| Tenancy | `organizations` | id, name, base_currency, country, fiscal_year_start, status |
| | `org_members` | organization_id, user_id, role, party_id (nullable), status; unique (organization_id, user_id) |
| | `parties` | organization_id, type (investor, manager, employee, supplier, customer, owner), display_name, pseudonymized_at |
| Ledger | `accounts` | organization_id, code, name, type, ownership_type (business/personal), is_active, parent_id; unique (organization_id, code) |
| | `accounting_periods` | organization_id, start, end, status (open/closed/locked), tb_hash |
| | `journal_entries` | organization_id, entry_no (numbering rule OQ-026), date, status (draft/posted), reverses_entry_id, source, external_id, fingerprint, posted_by, posted_at |
| | `journal_lines` | organization_id, entry_id, account_id, party_id, side, amount_minor, currency, fx_rate, fx_source, base_amount_minor |
| Banking | `bank_accounts` | organization_id, account_id (ledger), institution, last4 only, ownership_type |
| | `bank_transactions` | organization_id, bank_account_id, date, amount_minor, description, external_id, fingerprint, status |
| | `reconciliations`, `reconciliation_matches` | statement balance, matched sets, locked flag |
| Payables/Receivables | `invoices`, `bills`, `subscriptions`, `payment_allocations` | open-item model (BR-015) |
| Investors/profit | `shareholding_versions`, `profit_share_agreements`, `profit_share_lines`, `profit_distributions`, `profit_distribution_lines` | versioned, effective-dated; distribution lines snapshot percentages (BR-010) |
| People | `employees`, `salary_runs`, `salary_run_lines` | BR-014 |
| Assets | `assets`, `liabilities` | registers linked to ledger accounts |
| Files | `attachments` | organization_id, storage_key, sha256, mime, size, scan_status |
| Platform | `idempotency_keys`, `audit_events`, `exchange_rates`, `api_keys` (hashed), `feature_flags`, `outbox_events` | |

Bank account numbers are never stored in full; store last 4 digits only unless a decision says otherwise.

## 3. Tenant isolation pattern (illustrative SQL, not a migration)
```sql
alter table accounts enable row level security;
alter table accounts force row level security;

create policy accounts_select on accounts for select to authenticated
  using ( private.has_permission(organization_id, 'accounts:read') );
create policy accounts_write on accounts for insert to authenticated
  with check ( private.has_permission(organization_id, 'accounts:write') );
```
`private.has_permission` is `SECURITY DEFINER`, sets `search_path = ''`, reads `org_members` for `(select auth.uid())`, and returns false when unsure. Default is deny: a table with RLS enabled and no policy returns no rows.

## 4. Ledger integrity (illustrative)
1. `journal_lines` and posted `journal_entries` have `BEFORE UPDATE OR DELETE` triggers that raise an exception. `TRUNCATE` is revoked.
2. UPDATE/DELETE privileges on ledger tables are revoked from `anon`, `authenticated`, and `service_role`. Only the posting function (owned by a restricted role) inserts.
3. A constraint trigger on the draft-to-posted transition verifies `sum(debit)=sum(credit)` and at least two lines (BR-001), and rejects dates in closed periods (BR-004).
4. A `reverses_entry_id` unique index prevents reversing the same entry twice.
5. Unique indexes: `(organization_id, source, external_id)` where external_id is not null; non-unique fingerprint index feeds review (BR-013).
6. Account-type compatibility check by a posting-rule table (BR-008).

Residual risk: the database owner role and anyone with superuser/migration rights can bypass triggers. Mitigations: restricted access to those roles, audit hash chain (below), reviewed migrations, PITR (`BACKUP_RECOVERY.md`).

## 5. Audit log
`audit_events(id, organization_id, actor_id, actor_type, action, entity_type, entity_id, before_hash, payload_json, request_id, ip_hash, created_at, prev_hash, row_hash)`.
`row_hash = sha256(prev_hash || canonical(payload))`, chained per organization; inserts serialized by a per-organization advisory lock; no UPDATE/DELETE/TRUNCATE grants. A scheduled job verifies the chain and alerts on a break. External anchoring of the latest hash is OQ-021. Payloads exclude secrets and full bank numbers.

## 6. Reporting
Reports read posted lines only, via SQL views/functions that take `organization_id` and a date range. Period closing stores the Trial Balance hash in `accounting_periods.tb_hash`.

## 7. Indexing
At minimum `(organization_id, id)`, `(organization_id, date)`, `(organization_id, account_id, date)` on lines. Add partial indexes after measuring.
