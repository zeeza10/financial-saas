# Unit Testing

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define conventions and required coverage for unit tests of pure domain logic.

**Related:** `TESTING_STRATEGY.md`, `FINANCIAL_TEST_CASES.md`, `AI_CODING_RULES.md`

## 1. Scope
`packages/ledger-core` (money, posting rules, balance validation, period checks, profit-share calculation, FX conversion once OQ-006 is closed), validators and permission catalog.

## 2. Conventions
- File next to the unit or in `tests/`; name `<unit>.test.ts`. Arrange-Act-Assert; one behavior per test.
- Cite requirement ids in test names: `it('BR-001 rejects unbalanced entry')`.
- No network, database or real clock. Inject clock and id generator.

## 3. Mandatory unit and property tests
- Money: addition, negation, allocation (splitting an amount by percentages never loses or creates a minor unit), parsing and formatting, currencies with 0/2/3 decimals, overflow safety (use `bigint`).
- Property: for any generated valid entry, debits equal credits; for any generated sequence of postings and reversals, Trial Balance debits equal credits.
- Allocation: for any amount and percentages summing to 100, shares sum exactly to the amount.
- Duplicate fingerprint: stable and normalization-insensitive for whitespace/case.
- Account compatibility matrix (BR-008) exhaustive over type pairs.

## 4. Rules for tests themselves
Do not weaken or delete (`AI_CHANGE_CONTROL.md`). A failing test means the code or the test has a bug; investigate, explain, and get human approval before changing an expected financial value.
