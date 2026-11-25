# AI Change Control

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define what AI agents may change, what needs human approval, and the automated protections against weakened tests and security.

**Related:** `AI_CODING_RULES.md`, `AI_SECURITY_RULES.md`, `DATABASE_MIGRATIONS.md`, `RELEASE_CHECKLIST.md`, `CHANGE_MANAGEMENT.md`

## 1. Change classes
| Class | Examples | Who approves |
|---|---|---|
| A: Routine | UI text, new tests, small refactor within a module | Human reviewer on the pull request |
| B: Sensitive | Auth, RLS/policies, posting functions, permissions catalog, migrations, secrets handling, dependencies, CI config, AGENTS.md, security docs | Code owner + security reviewer |
| C: Irreversible | Production data/schema changes, deletions, key rotation, restores | Product owner, explicit written approval, human executes |

## 2. Protected paths (CODEOWNERS and branch protection, to be configured)
`supabase/migrations/**`, `supabase/tests/**`, `packages/ledger-core/**`, `tests/financial/**`, `tests/security/**`, `.github/**`, `AGENTS.md`, `docs/security/**`, `docs/ai/**`, `docs/product/BUSINESS_RULES.md`, permission catalog. Changes require review by the named owners; agents cannot approve their own pull requests; branch protection and CODEOWNERS rules must apply to administrators too, otherwise they can be bypassed; direct pushes to the main branch are blocked.

## 3. Test-integrity protections
CI jobs that fail the build when a pull request:
- deletes or renames a test file without a human-approved label;
- adds `.skip`, `.only`, `xit`, `xdescribe`, `todo` or equivalent;
- reduces the number of assertions or test cases in protected suites compared to the base branch (counts compared automatically);
- changes snapshot files or financial expected values without a reviewer from the owners list;
- lowers coverage thresholds or removes CI steps.
Financial and security test suites are in protected paths, so weakening them needs human owners.

## 4. Environment limits for agents
Agents work on branches with local or disposable databases. No production credentials, no production database access, no deploy rights. CI deploys after human approval.

## 5. Required evidence in every agent pull request
Task and requirement ids; files changed and why; tests run with output summary; items not tested; migrations included (yes/no); new dependencies (yes/no); security-relevant changes (yes/no).

## 6. Rollback
Every change can be reverted by Git revert; migrations follow `DATABASE_MIGRATIONS.md` recovery rules.
