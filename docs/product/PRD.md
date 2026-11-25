# Product Requirements Document (PRD)

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define what the Financial Management SaaS is, who it is for, and what the first releases must deliver.

**Related:** `SRS.md`, `BUSINESS_RULES.md`, `ACCOUNTING_MODEL.md`, `USER_ROLES.md`, `ROADMAP.md`, `COMPETITOR_ANALYSIS.md`, `OPEN_QUESTIONS.md`

## 1. Vision
A standalone, multi-tenant Financial Management SaaS, built first for eBay sellers and usable by any small or mid-size business. It keeps business money, personal money, investor money and profit sharing strictly separate, on top of a real double-entry ledger.

This is an independent product. It may integrate later with the existing eBay Multi-Account Dashboard through versioned APIs. That dashboard is **not** rebuilt or modified by this project.

## 2. Target users
- eBay and other marketplace sellers (single or multi-account) and their bookkeepers.
- Small businesses with partners, investors, managers and employees.
- Accountants and auditors who need read access or limited write access (see `USER_ROLES.md`).

## 3. Problems solved
1. Marketplace payouts do not match bank deposits, so books are hard to reconcile (see `COMPETITOR_ANALYSIS.md`).
2. Owners mix personal and business money, which corrupts profit figures.
3. Investor money is wrongly counted as revenue; profit-sharing history is lost when percentages change.
4. Spreadsheets allow silent edits and have no audit trail.

## 4. Scope (by module)
| ID | Module | Release |
|---|---|---|
| M01 | Organizations, users, roles | MVP |
| M02 | Chart of Accounts | MVP |
| M03 | General Ledger (double-entry, immutable posting) | MVP |
| M04 | Bank and cash accounts, transfers | MVP |
| M05 | Transactions, statement import, duplicate prevention | MVP |
| M06 | Income and expenses (company vs personal) | MVP |
| M07 | Reports: Trial Balance, P&L, Balance Sheet, Cash Flow | MVP |
| M08 | Audit log | MVP |
| M09 | Suppliers, invoices, subscriptions, payables/receivables | R2 |
| M10 | Investors, capital, shareholding | R2 |
| M11 | Profit sharing and distributions | R2 |
| M12 | Managers, employees, salaries | R2 |
| M13 | Individual ledgers (per party statements) | R2 |
| M14 | Assets and liabilities register | R2 |
| M15 | eBay Dashboard integration API | R3 |

Phasing is a proposal; the final order is an open decision (`OPEN_QUESTIONS.md`, OQ-020).

## 5. Out of scope for this phase
Writing application code, deploying, changing any production database, tax filing, payroll tax calculation.

## 6. Success measures (proposed)
- 100% of posted entries balanced (DB-enforced).
- Zero cross-tenant reads in automated isolation tests, run on every release.
- Reconciliation of a marketplace payout in under 5 minutes of user effort (to be validated with users).

## 7. Key constraints
Multi-tenant isolation, immutable ledger, international use (multi-currency, multiple jurisdictions), AI-assisted development under `AGENTS.md`.
