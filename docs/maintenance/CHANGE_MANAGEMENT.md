# Change Management

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define how changes to code, rules, documentation and infrastructure are proposed, reviewed, approved and recorded.

**Related:** `AI_CHANGE_CONTROL.md`, `RELEASE_CHECKLIST.md`, `DATABASE_MIGRATIONS.md`, `CHANGELOG.md`, `OPEN_QUESTIONS.md`

## 1. Flow
Request -> classify (A/B/C in `AI_CHANGE_CONTROL.md`) -> impact check (modules, API, database, security, docs) -> implement on a branch -> review -> CI gates -> approval -> release -> record.

## 2. Changes to business rules
Edit `BUSINESS_RULES.md` first (new or amended BR id, never reuse ids), update `ACCOUNTING_MODEL.md`, tests and dependent docs in the same pull request. Rules affecting historical data are applied prospectively unless a migration plan is approved.

## 3. Changes to documentation
Docs are code: pull request, review, version bump and date. Update `DOCUMENTATION_STATUS.md` and `DOCUMENTATION_INDEX.md`. Contradictions are bugs.

## 4. Compatibility
Follow `API_SPECIFICATION.md` versioning and `DATABASE_MIGRATIONS.md` expand/contract. Feature flags for risky changes.

## 5. Emergency changes
Allowed for Sev 1 incidents with product owner approval by message; reviewed after the fact within 2 business days; recorded in `CHANGELOG.md`.

## 6. Records
Pull request, ADR, changelog entry, approval. Security exceptions carry owner, reason, expiry.
