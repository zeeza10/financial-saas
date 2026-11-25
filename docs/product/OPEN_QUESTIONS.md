# Open Questions

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Register every unresolved business, accounting, security and technical decision. Documents must reference these IDs instead of guessing.

**Related:** `BUSINESS_RULES.md`, `ACCOUNTING_MODEL.md`, `PROJECT_READINESS_REPORT.md`, `CHANGE_MANAGEMENT.md`

Severity: **Blocker** = must close before the named phase starts. **Important** = close before the related module ships. **Later** = can wait.
Owner "Zeeshan" means the product owner; "Accountant" means a qualified accountant must advise. Nobody has answered these yet.

| ID | Question | Area | Severity | Blocks | Decider |
|---|---|---|---|---|---|
| OQ-001 | Is profit calculated on cash or accrual basis? What is excluded from distributable profit? | Accounting | **Closed (2026-11-26)** — Accrual basis (`BUSINESS_RULES.md` BR-011) | Ledger/Reports | Owner + Accountant |
| OQ-002 | Inventory costing method (FIFO, average)? Is inventory tracked at all in MVP? | Accounting | Important | R2 | Owner + Accountant |
| OQ-003 | Is investor money equity or loan, per investor? Can one investor have both? | Accounting | **Closed (2026-11-26)** — Selectable Equity or Loan per investor/agreement (`BUSINESS_RULES.md` BR-007) | Investors | Owner + Accountant |
| OQ-004 | Reimbursement and tax treatment of personal/company cross-payments. | Accounting | Important | MVP expense flow | Accountant |
| OQ-005 | Who may reopen a closed period besides Owner? Any time limit? | Control | Important | Period close | Owner |
| OQ-006 | FX rounding, rate source, realized/unrealized gain-loss, revaluation. | Accounting | **Deferred to R2 (2026-11-26)** — Single base currency per org in Core MVP (M01-M08); multi-currency + FX rules in R2 | FR-017 (R2) | Accountant |
| OQ-007 | Sales tax / VAT handling (marketplace-facilitated tax, collected vs remitted). | Tax | Important | Reports | Accountant |
| OQ-008 | Depreciation method and assets register scope. | Accounting | Later | M14 | Accountant |
| OQ-009 | Payroll scope: salary only, or also tax, benefits, loans/advances? | Scope | Important | M12 | Owner |
| OQ-010 | Treatment of refunds, chargebacks, disputes and holds from marketplaces. | Accounting | Important | eBay flow | Owner + Accountant |
| OQ-011 | Target jurisdictions at launch and tax/regulatory obligations. | Legal | Important | Launch | Owner + legal |
| OQ-012 | Data residency options (EU region) and Supabase project region. | Legal/Infra | Important | Launch | Owner |
| OQ-013 | GDPR erasure vs financial record retention periods per country. | Legal | Important | Launch | Legal |
| OQ-014 | Support access model: can staff ever view tenant data, how approved, how logged? | Security | **Closed (2026-11-26)** — Zero default staff access; optional time-limited, customer-granted, audited read-only access | Support tooling | Owner |
| OQ-015 | Browser session model: BFF with httpOnly cookies (proposed) vs supabase-js tokens in browser storage. See ADR-0004. | Security | **Closed (2026-11-26)** — BFF `httpOnly` cookie sessions + CSRF (`ADR-0004-session-model.md` Accepted) | Auth implementation | Owner + architect |
| OQ-016 | Target RPO/RTO and backup tier (proposed RPO 15 min, RTO 4 h). Requires Supabase plan with PITR. | Ops | Blocker | Production | Owner |
| OQ-017 | Attachment malware scanning approach and allowed file types/size. | Security | Important | FR-018 | Architect |
| OQ-018 | How eBay data is obtained (eBay API, CSV, via existing Dashboard) and eBay API terms compliance. | Integration | Important | R3 | Owner |
| OQ-019 | Plans, pricing, tenant limits, and who pays for Supabase compute per tenant. | Business | **Closed (2026-11-26)** — Billing/plan-ready schema in foundation; Stripe checkout deferred post-MVP | Billing | Owner |
| OQ-020 | Final module phasing (PRD proposal vs alternatives). | Scope | **Closed (2026-11-26)** — Staged milestones: Core MVP M01-M08 -> R2 Business Modules -> R3 MultiAcc API | Phase planning | Owner |
| OQ-021 | External anchoring of audit-log hash chain (for example object-lock storage) and frequency. | Security | Important | Audit log | Architect |
| OQ-022 | Database access path from Workers: PostgREST/RPC over HTTPS vs Hyperdrive direct Postgres. See ADR-0003. | Architecture | **Closed (2026-11-26)** — Postgres RPC over HTTPS (`ADR-0003-db-access.md` Accepted) | Backend | Architect |
| OQ-023 | MFA requirement per role and separation-of-duties thresholds. | Security | **Closed (2026-11-26)** — MFA required for Owner, Admin, Accountant (`AUTH_SECURITY.md`); per-org approval threshold configurable | Auth | Owner |
| OQ-024 | Accessibility and localization commitments for launch markets. | Product | Later | UI | Owner |
| OQ-025 | Third-party penetration test provider and timing before public launch. | Security | Important | Launch | Owner |

## How to close a question
Record the decision as an ADR (technical) or an update to `BUSINESS_RULES.md` (business), mark the row Closed here with date and link, and update dependent documents in the same change.

## Added during the documentation audit (2026-11-26)
| ID | Question | Area | Severity | Blocks | Decider |
|---|---|---|---|---|---|
| OQ-026 | Must journal entry numbers be gapless per organization (some jurisdictions and auditors expect it)? Affects sequence design and concurrency. | Accounting/Legal | **Closed (2026-11-26)** — Gapless per-organization entry numbers (`accounting_periods` / serialized org sequence) | Ledger schema | Accountant + legal |
| OQ-027 | Rounding remainder rule when allocating amounts (profit shares, payments): who receives the odd minor unit? | Accounting | **Closed (2026-11-26)** — Largest-remainder method (`BUSINESS_RULES.md` BR-010) | BR-010, FT-14 | Accountant |
