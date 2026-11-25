# Security Testing

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define automated and manual security testing, tools, cadence, and the gates for release approval.

**Related:** `SECURITY_TEST_CASES.md`, `TESTING_STRATEGY.md`, `RELEASE_CHECKLIST.md`, `THREAT_MODEL.md`, `SECURITY_REMEDIATION_PLAN.md`

## 1. Automated (CI, every pull request)
| Check | Purpose | Gate |
|---|---|---|
| Secret scanning (gitleaks) | T-12 | Block |
| SAST (Semgrep rules, CodeQL) | T-01, T-03, T-04 | Block on high |
| Dependency audit (npm audit / OSV-Scanner) and license check | T-13 | Block on high/critical without approved exception |
| Lint rules: no `dangerouslySetInnerHTML`, no `eval`, boundary rules | T-01, module rules | Block |
| RLS coverage query: every public table has RLS and policies | T-09 | Block |
| pgTAP tenant-isolation and ledger tests | T-05, T-09, T-16, T-17 | Block |
| Protected-path and test-integrity checks (`AI_CHANGE_CONTROL.md`) | T-18 | Block |
| OpenAPI breaking-change diff | API compatibility | Block |
| SBOM generation and signature/provenance check on release builds | T-13 | Record |
| Security headers / CSP test on preview | T-01, T-10 | Block |

## 2. Scheduled
Weekly dependency scan; nightly audit-chain and trial-balance integrity job in staging; DAST baseline (OWASP ZAP) against staging weekly.

## 3. Manual
- Threat model review per new module.
- Authorization matrix review per release touching permissions.
- Independent penetration test before public launch and after major changes (OQ-025).
- Restore drill quarterly (`BACKUP_RECOVERY.md`).

## 4. Release approval
A release needs: all gates green; no open Critical or High findings (or a written, time-limited exception from the product owner); security reviewer sign-off for changes to auth, RLS, ledger, migrations, secrets handling; checklist completed (`RELEASE_CHECKLIST.md`).

## 5. Findings handling
Critical: fix before release, hotfix path. High: fix within 7 days (proposed). Medium: 30 days. Low: backlog. Track in `SECURITY_REMEDIATION_PLAN.md` until tooling exists.

## 6. Standards mapping
Map ASVS requirements to controls and tests when implementation starts and store the map in `SECURITY_TEST_CASES.md`. Not done yet.
