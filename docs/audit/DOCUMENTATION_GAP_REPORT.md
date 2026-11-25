# Documentation Gap Report

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** List missing, incomplete and inconsistent documentation, what was fixed during review, and what still needs decisions.

**Related:** `SECURITY_AUDIT_REPORT.md`, `DOCUMENTATION_STATUS.md`, `OPEN_QUESTIONS.md`, `SECURITY_REMEDIATION_PLAN.md`

## 1. Coverage against the project brief
All documents in sections A-F of the master brief exist, plus `DOCUMENTATION_INDEX.md`, `DOCUMENTATION_STATUS.md`, `OPEN_QUESTIONS.md`, `ACCOUNTING_MODEL.md` (added to hold the accounting model separately from numbered rules), ADRs 0001-0006, root `AGENTS.md`, and the four audit/readiness documents. No required file is missing.

## 2. Traceability (checked by script)
| Link | Result |
|---|---|
| Business rules BR-001..BR-022 -> financial tests FT-01..FT-35 | Every rule has at least one test case |
| Threats T-01..T-20 -> security tests ST-01..ST-20 | One-to-one |
| Open questions OQ-001..OQ-027 -> referenced by at least one other document | Yes after fixes |
| Document references (backticked file names and links) | All resolve |
| Version and last-updated date on every file | Yes |
| Requirement ids (FR/NFR) -> tests | **Not yet traced**: FR/NFR ids exist in `SRS.md`, but no matrix maps them to tests. Add when tests exist |

## 3. Gaps fixed during the audit
| Change | Files |
|---|---|
| Added tests FT-34 (shareholding vs profit share) and FT-35 (pseudonymization keeps ledger intact) | `FINANCIAL_TEST_CASES.md` |
| Added OQ-026 (gapless entry numbers) and OQ-027 (rounding remainder rule); linked from schema, rules, tests | `OPEN_QUESTIONS.md`, `DATABASE_SCHEMA.md`, `BUSINESS_RULES.md`, `FINANCIAL_TEST_CASES.md` |
| Service role key must not be held by the user-facing Worker; jobs separate | `AUTHORIZATION_RBAC_RLS.md` |
| Assume direct database API calls by users (rule 4a) | `AUTHORIZATION_RBAC_RLS.md` |
| Idempotency key scoping and expiry | `API_SPECIFICATION.md` |
| CI/CD security section; SBOM gate; admin-inclusive branch protection | `DEPLOYMENT.md`, `SECURITY_TESTING.md`, `AI_CHANGE_CONTROL.md` |
| Linked unreferenced open questions (OQ-002, 008, 010, 018, 019, 024) | `ACCOUNTING_MODEL.md`, `ROADMAP.md`, `SRS.md` |
| Fixed numbering, duplicate related-link, non-existent folder reference | `AI_CONTEXT.md`, `SECURITY_TESTING.md`, `BACKUP_RECOVERY.md` |
No application code, configuration or production setting was touched; none exists.

## 4. Remaining incomplete documents
See `DOCUMENTATION_STATUS.md`: `DATABASE_SCHEMA.md` (no SQL or ERD), `API_SPECIFICATION.md` (no OpenAPI), `SECURITY_TESTING.md` (no standards mapping), `SECRETS_MANAGEMENT.md` (empty inventory), `INCIDENT_RESPONSE.md` (no names or runbooks), `BACKUP_RECOVERY.md` (unapproved objectives), `MONITORING.md`, `ENVIRONMENT_SETUP.md`, `USER_GUIDE.md`, `COMPETITOR_ANALYSIS.md`.

## 5. Gaps that need a human decision, not a document edit
The 27 open questions. The Critical and blocker items are summarized in `PROJECT_READINESS_REPORT.md`.

## 6. Limits of the consistency check
The script verifies structure and identifiers. It cannot confirm that two documents describe the same behavior in different words, nor that accounting treatments are correct. A human read-through and an accountant review of `BUSINESS_RULES.md` and `ACCOUNTING_MODEL.md` are required.

## 7. Known simplifications to review
- Role names and the permission matrix are proposals.
- Numeric targets (RPO/RTO, latency, coverage, rotation periods, response times) are proposals, not commitments.
- Posting patterns in `ACCOUNTING_MODEL.md` are generic and not jurisdiction-specific.
