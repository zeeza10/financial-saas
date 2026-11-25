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
- 0.2.0 (2026-11-26): Initialized standalone `financial-saas` repository skeleton linked to `zeeza10/financial-saas`; recorded Product Owner decisions closing OQ-001 (accrual basis), OQ-003 (selectable equity/loan per investor), OQ-006 (single base currency in Core MVP, multi-currency in R2), OQ-014 (zero default support access), OQ-015 / ADR-0004 (BFF httpOnly cookie sessions), OQ-019 (billing-ready schema with Stripe deferred post-MVP), OQ-020 (staged milestones M01-M08 -> R2 -> R3), OQ-022 / ADR-0003 (Postgres RPC over HTTPS), OQ-023 (mandatory MFA for Owner/Admin/Accountant), OQ-026 (gapless per-org entry numbers), and OQ-027 (largest-remainder rounding).

### Documentation
- 0.1.0 (2026-11-26): Initial documentation package created: product, architecture, security, AI development rules, testing, maintenance, audit and readiness reports. AGENTS.md added at repository root. No application code, no database changes, no deployment.
