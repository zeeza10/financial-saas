# AI Review Checklist

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Checklist that the agent and the human reviewer complete for every AI-generated change.

**Related:** `AI_CODING_RULES.md`, `AI_CHANGE_CONTROL.md`, `RELEASE_CHECKLIST.md`, `SECURE_CODING.md`

Mark each item Yes / No / N/A with a note.

**Scope and quality**
- [ ] Diff contains only changes required by the task; no unrelated files.
- [ ] No existing working feature was rebuilt; no duplicated component or business logic.
- [ ] Requirement and business-rule ids are referenced; no [OPEN] question was guessed.
- [ ] No unnecessary dependency was added; any addition is justified in the PR.

**Tests**
- [ ] No test deleted, skipped, weakened or re-baselined; assertion counts not reduced.
- [ ] New logic has tests; financial changes have financial tests (`FINANCIAL_TEST_CASES.md`).
- [ ] Relevant tests were actually run; output is attached; untested parts are listed.

**Security**
- [ ] Authorization checked server-side; every query is organization-scoped.
- [ ] Input validated by schema; no dynamic SQL or HTML from raw input.
- [ ] No secret, token or personal data in code, logs, tests or the diff.
- [ ] No security control weakened (CORS, CSP, RLS, rate limits, auth).
- [ ] Sensitive operations write audit events.

**Data and migrations**
- [ ] No unapproved production database change; migrations have the required header and recovery plan.
- [ ] New tables have RLS enabled and forced with policies and tests.
- [ ] Posted ledger data is never modified.

**Compatibility and docs**
- [ ] API and database changes are backward compatible or follow the versioning policy.
- [ ] Docs, ADR and changelog updated.
- [ ] Complete Git diff was reviewed line by line.
- [ ] The summary does not claim completeness beyond what was tested.
