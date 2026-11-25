# End-to-End Testing

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define the browser-level tests for the main user flows and critical security behaviors.

**Related:** `USER_FLOWS.md`, `TESTING_STRATEGY.md`, `SECURITY_TEST_CASES.md`

## 1. Tooling
Playwright against a preview environment with synthetic data. Tests run in CI on pull requests (smoke set) and nightly (full set).

## 2. Scenarios (one per flow in `USER_FLOWS.md`)
| ID | Flow | Key assertions |
|---|---|---|
| E2E-01 | F1 sign-up, MFA, create organization | Chart of Accounts seeded; Owner role |
| E2E-02 | F2 CSV import with duplicates | Duplicates flagged; no partial import on error |
| E2E-03 | F3 post transaction | Balanced entry posted; audit visible; unbalanced rejected |
| E2E-04 | F4 transfer | Income/expense unchanged on P&L |
| E2E-05 | F5 reversal | Original unchanged; reversal linked; net effect zero |
| E2E-06 | F6 reconcile | Difference zero required; matched lines locked |
| E2E-07 | F7 close period | Posting into period blocked; reopen requires Owner |
| E2E-08 | F8 distribution | Uses agreement version effective in period |
| E2E-09 | F9 investor view | Only own ledger; foreign URLs return not-found |
| E2E-10 | F10 user removal | Session revoked immediately |

## 3. Security-focused E2E
Cross-tenant URL tampering; role-restricted UI hidden **and** server-blocked; CSRF failure when token missing; security headers/CSP present; XSS payloads in names render as text.

## 4. Practices
Stable selectors (`data-testid`), no fixed sleeps, screenshots/traces on failure, accessibility checks (axe) on main screens.
