# Security Remediation Plan

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Turn audit findings into ordered actions with owners, timing and verification. Statuses stay Open until verified by evidence, not by editing a document.

**Related:** `SECURITY_AUDIT_REPORT.md`, `SECURITY_TESTING.md`, `OPEN_QUESTIONS.md`, `PROJECT_READINESS_REPORT.md`, `RELEASE_CHECKLIST.md`

Owners are roles; names to be assigned. "When" uses roadmap phases from `ROADMAP.md`.

| Finding | Sev | Action | Owner | When | Verified by |
|---|---|---|---|---|---|
| F-01 | Critical | Decide session model (accept or replace ADR-0004); document CSRF design in `AUTH_SECURITY.md` | Product owner + architect | Before Phase 1 auth work | ADR status Accepted; ST-02, ST-07 pass |
| F-02 | Critical | Accountant review of `BUSINESS_RULES.md`/`ACCOUNTING_MODEL.md`; close OQ-001, OQ-026, OQ-027 (OQ-006 before multi-currency) | Product owner + accountant | Before Phase 2 | Rules updated; FT cases finalized |
| F-03 | High | Decide support access model; implement grant, expiry, audit | Product owner | Before support tooling and pilot | ST-20 passes |
| F-04 | High | Implement RLS framework, separate jobs Worker, CI RLS-coverage query, isolation suite generated from table list | Lead developer | Phase 1 | ST-05, ST-09 green on every PR |
| F-05 | High | Restrict and log privileged DB roles; decide and implement external anchoring (OQ-021); nightly chain verification | Architect | Phase 1-2 | ST-17 and monitoring alert tested |
| F-06 | High | Configure CODEOWNERS, branch protection (admins included), CI test-integrity and protected-path checks; agents run without production credentials | Repo admin | Before any agent writes code | Deliberate test PRs deleting a test and editing a protected file are blocked |
| F-07 | High | Approve RPO/RTO and plan tier; write restore and per-tenant restore runbooks; first restore drill | Product owner + ops | Before pilot | Drill report meets targets |
| F-08 | High | Decide ADR-0003 with a small prototype measuring atomicity, latency, connection handling | Architect | Before Phase 2 | ADR Accepted; ST-15 passes |
| F-09 | Medium | Verify current OWASP editions; build control-to-test map (ASVS L2) | Security reviewer | Phase 1, update each release | Map stored in `SECURITY_TEST_CASES.md` |
| F-10 | Medium | Verify platform limits and features against current vendor docs; amend `ARCHITECTURE.md` section 6 | Architect | Before Phase 1 | Notes with date and source |
| F-11 | Medium | Legal review: jurisdictions, retention vs erasure, residency, privacy policy, DPA | Product owner + counsel | Before pilot with EU customers | Signed-off policies |
| F-12 | Medium | Choose scanning and allowed file types | Architect | Before attachments (R2) | ST-11 passes |
| F-13 | Medium | Decide MFA scope and approval thresholds | Product owner | Phase 1 | ST-07, ST-08 cover decision |
| F-14 | Medium | Implement documented CI/CD hardening | Repo admin | Phase 1 | Settings export reviewed |
| F-15 | Medium | Minimize exposed schemas, revoke unneeded grants, add direct-API tests | Lead developer | Phase 1 | Tests calling database API directly with a user JWT |
| F-16 | Medium | Implement idempotency store with scoping | Developer | Phase 2 | FT-17 and cross-org replay test |
| F-17, F-18 | Low | Done in documents | - | Done | Consistency script |
| F-19 | Low | Run trials, review vendor API/terms, re-date | Product owner | Before pricing decisions | Updated analysis |
| F-20 | Medium | Select provider and schedule test | Product owner | Before public launch | Report received; findings closed |

## Sequencing
1. **Before Phase 1 starts:** F-01, F-06 (at least agent restrictions), F-10, decisions OQ-015, OQ-020, OQ-022.
2. **During Phase 1:** F-04, F-05, F-09, F-13, F-14, F-15.
3. **Before Phase 2 (ledger):** F-02, F-08.
4. **Before pilot users:** F-03, F-07, F-11, F-12.
5. **Before public launch:** F-20 and re-run of this audit on the real code.

## Rule
A finding closes only with evidence (passing test, configuration export, signed decision), recorded in this table with date and link.
