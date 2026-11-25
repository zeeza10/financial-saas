# Changelog

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Record notable changes to the product and documentation, newest first.

**Related:** `CHANGE_MANAGEMENT.md`, `RELEASE_CHECKLIST.md`, `DOCUMENTATION_STATUS.md`

Format: Keep a Changelog style; versions follow semantic versioning once code exists.

## [Unreleased]
### Added
- 0.4.0 (2026-11-26): Implemented Phase 5 Business Modules (`modules/operations`, migration `0003_business_modules.sql`, pgTAP suite `03_business_modules_rls.sql`, pure P&L calculation `computeProfitAndLoss`, `/v1` routes for Parties/Individual Ledgers/GDPR Pseudonymization, Company vs Personal Expenses, Invoices/Bills AP/AR, Investor Contributions, Versioned Profit-Sharing Agreements & Distributions, Compensation/Salary Runs, Assets, Liabilities, eBay Payouts, React UI panels, and Phase 5 financial & security tests).
- 0.3.0 (2026-11-26): Implemented Phase 4 Core Financial Engine (`modules/ledger`, `modules/banking`, migration `0002_core_ledger_and_banking.sql`, pgTAP suite `02_ledger_immutability_and_balance.sql`, `/v1` CoA/Periods/Journals/Trial Balance/Banking/Transfers/CSV Import/Reconciliation routes, React UI panels, and Phase 4 financial & security integration tests).
- 0.2.0 (2026-11-26): Initialized standalone `financial-saas` repository skeleton linked to `zeeza10/financial-saas`; recorded Product Owner decisions closing OQ-001 (accrual basis), OQ-003 (selectable equity/loan per investor), OQ-006 (single base currency in Core MVP, multi-currency in R2), OQ-014 (zero default support access), OQ-015 / ADR-0004 (BFF httpOnly cookie sessions), OQ-019 (billing-ready schema with Stripe deferred post-MVP), OQ-020 (staged milestones M01-M08 -> R2 -> R3), OQ-022 / ADR-0003 (Postgres RPC over HTTPS), OQ-023 (mandatory MFA for Owner/Admin/Accountant), OQ-026 (gapless per-org entry numbers), and OQ-027 (largest-remainder rounding).

### Documentation
- 0.1.0 (2026-11-26): Initial documentation package created: product, architecture, security, AI development rules, testing, maintenance, audit and readiness reports. AGENTS.md added at repository root. No application code, no database changes, no deployment.
