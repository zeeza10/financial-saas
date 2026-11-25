# AI Context

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Give an AI agent the shortest accurate description of the project, vocabulary and reading order, so it starts from facts instead of assumptions.

**Related:** `AGENTS.md`, `DOCUMENTATION_INDEX.md`, `PRD.md`, `ARCHITECTURE.md`, `BUSINESS_RULES.md`

## 1. Project in five lines
Standalone multi-tenant Financial Management SaaS (first for eBay sellers). Double-entry, immutable ledger. React + TypeScript, Cloudflare Workers, Supabase Postgres and Auth. Documentation-first: no application code exists yet. The separate eBay Multi-Account Dashboard is out of scope and must not be modified.

## 2. Reading order for a task
1. `AGENTS.md`  2. `DOCUMENTATION_INDEX.md`  3. `OPEN_QUESTIONS.md` (is the task blocked?)  4. `BUSINESS_RULES.md` and `ACCOUNTING_MODEL.md` for money logic  5. `ARCHITECTURE.md`, `MODULE_ARCHITECTURE.md`, `DATABASE_SCHEMA.md`  6. `SECURE_CODING.md`, `AUTHORIZATION_RBAC_RLS.md`  7. the relevant testing document.

## 3. Glossary (one term, one meaning)
| Term | Meaning |
|---|---|
| Organization | The tenant. All data belongs to exactly one. |
| Party | A person or company related to an organization: investor, manager, employee, supplier, customer, owner. |
| Journal entry / line | A balanced set of debit and credit lines. |
| Posted | Final and immutable. Draft is editable. |
| Reversal | A new entry that cancels a posted entry. |
| Business / personal account | Account `ownership_type`; personal is excluded from company statements. |
| Investor capital | Equity (or loan, OQ-003), never revenue. |
| Shareholding vs profit share | Separate attributes (BR-012). |
| Period | Accounting period: open, closed, locked. |
| Minor units | Integer smallest currency unit (cents). |

## 4. Where truth lives
Business rules: `BUSINESS_RULES.md`. Open decisions: `OPEN_QUESTIONS.md`. Technical decisions: ADRs. If code and docs disagree, stop and report; do not silently choose.

## 5. Staleness
Documents carry version and date. If a document is older than the code it describes, flag it in `DOCUMENTATION_STATUS.md`.
