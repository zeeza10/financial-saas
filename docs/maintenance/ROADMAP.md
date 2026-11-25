# Roadmap

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Show the proposed phased plan and how new modules are added safely. Phasing is a proposal pending OQ-020.

**Related:** `PRD.md`, `MODULE_ARCHITECTURE.md`, `OPEN_QUESTIONS.md`, `PROJECT_READINESS_REPORT.md`

| Phase | Content | Exit criteria |
|---|---|---|
| 0 Foundation (now) | Documentation, decisions on blockers (OQ-001, 014, 015, 016, 020, 022) | Product owner approval to start implementation |
| 1 Platform skeleton | Repo, CI gates, environments, auth + MFA, organizations, roles, RLS framework, audit log, test harness | Isolation and audit tests green |
| 2 Ledger core | Chart of Accounts, journal posting, immutability, periods, Trial Balance | FT-01 to FT-05, FT-20 to FT-24, FT-19 green |
| 3 Banking and import | Accounts, transfers, CSV import, duplicates, reconciliation | FT-06, FT-15 to FT-17, FT-27 green |
| 4 Income/expense and reports | Company vs personal classification, P&L, Balance Sheet, Cash Flow | FT-09 to FT-11, FT-18, FT-33 green |
| 5 MVP hardening | Pen test, backup/restore drill, performance, user guide | Release checklist complete |
| 6 Parties and profit | Suppliers, investors, shareholding, profit sharing, individual ledgers | FT-08, FT-12 to FT-14, FT-31 green |
| 7 People and assets | Employees, salaries, assets and liabilities | FT-26 green |
| 8 Integrations | Public API, eBay Dashboard integration (data source approach OQ-018) | Contract tests, API key security tests |

Billing, plans and tenant limits (OQ-019) are scheduled after the MVP is stable.

Each phase ships behind feature flags and passes the full regression suite. Later ideas (not committed): bank feeds, tax reports, mobile app, multi-entity consolidation.
