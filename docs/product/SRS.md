# Software Requirements Specification (SRS)

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** List testable functional and non-functional requirements with stable IDs so tests and code can trace to them.

**Related:** `PRD.md`, `BUSINESS_RULES.md`, `SECURITY_POLICY.md`, `TESTING_STRATEGY.md`, `API_SPECIFICATION.md`

Priority: **M** = must (MVP), **S** = should, **C** = could. Each requirement maps to tests in `FINANCIAL_TEST_CASES.md` or `SECURITY_TEST_CASES.md`.

## 1. Functional requirements
| ID | Requirement | Pri |
|---|---|---|
| FR-001 | A user can belong to one or more organizations with a role per organization. | M |
| FR-002 | Each organization has its own Chart of Accounts, seeded from a template, editable by Admin/Accountant. | M |
| FR-003 | Journal entries post atomically and only if debits equal credits (BR-001). | M |
| FR-004 | Posted entries cannot be edited or deleted; corrections use reversal entries (BR-003). | M |
| FR-005 | Bank, cash and (separately flagged) personal accounts can be created; transfers between them post no income or expense (BR-005, BR-006). | M |
| FR-006 | Transactions can be imported from CSV; duplicates are detected and blocked or flagged (BR-013). | M |
| FR-007 | Income and expense items are classified as company or personal (BR-009). | M |
| FR-008 | General Ledger, Trial Balance, P&L, Balance Sheet and Cash Flow reports are generated from posted lines only. | M |
| FR-009 | Accounting periods can be closed; posting into a closed period is rejected (BR-004). | M |
| FR-010 | Every sensitive action writes a tamper-evident audit record (BR-021). | M |
| FR-011 | Suppliers, bills, invoices, subscriptions with payable/receivable tracking (BR-015). | S |
| FR-012 | Investor records, capital contributions and withdrawals treated as equity or loan per agreement (BR-007). | S |
| FR-013 | Versioned profit-sharing agreements and period distributions (BR-010). | S |
| FR-014 | Employees/managers, salary accrual and payment (BR-014). | S |
| FR-015 | Individual ledger statement for any party (BR-017). | S |
| FR-016 | Bank statement reconciliation with matching (BR-020). | S |
| FR-017 | Multi-currency amounts with stored exchange rate and source (BR-016). | S |
| FR-018 | Attachments (receipts, invoices) in private storage, scanned and access-controlled. | S |
| FR-019 | Public, versioned API for integrations (eBay Dashboard). | C |

## 2. Non-functional requirements
| ID | Requirement | Pri |
|---|---|---|
| NFR-001 | All data access is organization-scoped and enforced by RLS plus server-side checks. | M |
| NFR-002 | Money is stored as integer minor units with an ISO 4217 currency code; no floating point. | M |
| NFR-003 | API p95 latency under 500 ms for list/read calls at 100k ledger lines per organization (target, to be measured). | S |
| NFR-004 | Report generation for 12 months of data under 10 s (target, to be measured). | S |
| NFR-005 | Backups and restore objectives in `BACKUP_RECOVERY.md` are met and tested at least quarterly. | M |
| NFR-006 | Accessibility target WCAG 2.2 AA (commitment level OQ-024). | S |
| NFR-007 | Data residency options for EU customers (decision pending, OQ-012). | S |
| NFR-008 | All changes pass CI gates in `RELEASE_CHECKLIST.md`. | M |
| NFR-009 | API changes follow `API_SPECIFICATION.md` versioning and deprecation policy. | M |
| NFR-010 | Localization-ready UI (English first). | C |

## 3. Assumptions and constraints
- Stack direction: React + TypeScript, Cloudflare Workers, Supabase Postgres/Auth (see `ARCHITECTURE.md`).
- Unresolved items live in `OPEN_QUESTIONS.md`; this SRS does not guess them.
