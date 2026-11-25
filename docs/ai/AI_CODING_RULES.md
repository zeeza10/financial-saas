# AI Coding Rules

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Detailed behavioral rules for AI coding agents working in this repository. The short permanent version is the root AGENTS.md.

**Related:** `AGENTS.md`, `AI_CHANGE_CONTROL.md`, `AI_SECURITY_RULES.md`, `AI_WORKFLOW.md`, `SECURE_CODING.md`

## 1. The fifteen rules (from the project brief)
1. Never unnecessarily rebuild existing working features.
2. Never modify unrelated files without justification.
3. Never delete existing tests to make builds pass.
4. Never weaken security controls.
5. Never expose API keys, passwords, tokens or secrets.
6. Never make unapproved production database changes.
7. Never introduce duplicate components or business logic.
8. Never install unnecessary dependencies.
9. Always inspect existing architecture before changing code.
10. Always run relevant tests after changes.
11. Always review the complete Git diff.
12. Document important architectural changes.
13. Maintain backward compatibility where practical.
14. Ask for approval before destructive or irreversible operations.
15. Never claim that untested functionality is complete.

## 2. How the rules are applied
- **Scope:** one task, one branch, the smallest diff. If extra work seems needed, propose it instead of doing it.
- **Reuse first:** search for an existing component/function before writing one. Business rules are implemented once, in the place named by `MODULE_ARCHITECTURE.md`, citing the BR id.
- **No guessing accounting:** if a rule is not in `BUSINESS_RULES.md` or is marked [OPEN], stop and ask; do not invent policy.
- **Tests:** never delete, skip (`.skip`, `xit`), loosen assertions, raise tolerances or change expected financial values to make tests pass. If a test seems wrong, explain why and ask a human.
- **Dependencies:** state purpose, size, maintenance status, license, and alternatives before adding.
- **Migrations:** write them but never apply to shared or production databases.
- **Honest reporting:** say exactly what was run and what was not. "Untested" is a valid status.
- **Money:** only the shared money library, integer minor units.
- **Security:** follow `SECURE_CODING.md`; stop and escalate if a change touches auth, RLS, ledger, secrets or migrations (protected paths).

## 3. Definition of done for an agent task
Requirement id referenced; code and tests written; relevant tests run with results shown; lint/type checks pass; full diff reviewed; docs updated; no secrets; changelog entry if user-visible; checklist in `AI_REVIEW_CHECKLIST.md` completed.
