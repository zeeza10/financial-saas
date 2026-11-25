# Testing Strategy

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define the overall test approach, test types, tools, environments, traceability and quality gates.

**Related:** `UNIT_TESTING.md`, `INTEGRATION_TESTING.md`, `E2E_TESTING.md`, `FINANCIAL_TEST_CASES.md`, `SECURITY_TEST_CASES.md`, `RELEASE_CHECKLIST.md`, `SRS.md`

## 1. Test types
| Type | Scope | Main tool (proposed) |
|---|---|---|
| Unit | Pure logic (`ledger-core`, validators) | Vitest, fast-check (property tests) |
| Database | Constraints, triggers, RLS, posting functions | pgTAP on local/branch Postgres |
| Integration | API Worker + database | Vitest with local Supabase and Miniflare/wrangler dev |
| Functional / E2E | User flows F1-F10 | Playwright |
| Regression | Full suite plus golden financial scenarios | CI on every pull request |
| Financial | Accounting invariants and scenarios | `FINANCIAL_TEST_CASES.md` |
| Security | Threats T-01 to T-20 | `SECURITY_TEST_CASES.md`, Semgrep, ZAP |
| Multi-tenant isolation | Cross-organization access on every table and endpoint | Generated pgTAP + API tests |
| Performance (later) | Targets NFR-003, NFR-004 | k6 |

## 2. Principles
- Every requirement (FR/NFR) and business rule (BR) has at least one test; traceability table maintained in `TESTING_STRATEGY.md` once tests exist.
- Tests are deterministic; time and randomness injected; no dependence on order.
- Financial tests use synthetic data only; golden scenarios have human-verified expected values stored in protected paths.
- Tests that protect money and tenancy are in protected paths (`AI_CHANGE_CONTROL.md`).
- A bug fix starts with a failing test.

## 3. Test data
Fixtures create at least three canary organizations with overlapping names/amounts to expose leaks. No production data. Anonymized snapshots only in staging.

## 4. Quality gates (proposed, adjust after baseline)
Unit/DB/integration green; no skipped tests in protected suites; line coverage >= 85% on `ledger-core` and posting functions' tests cover all branches; mutation testing on `ledger-core` before launch (target >= 80% killed). Coverage numbers are proposals to be calibrated, not achieved results.

## 5. Environments
Local (disposable DB), CI (ephemeral DB per run), staging (production-like).

## 6. Defect handling
Severity per `SECURITY_TESTING.md` for security bugs; financial-integrity defects are always Critical.
