# Business Rules

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Single source of truth for numbered business and accounting rules. Code, tests and other documents cite these IDs.

**Related:** `ACCOUNTING_MODEL.md`, `FINANCIAL_TEST_CASES.md`, `SRS.md`, `OPEN_QUESTIONS.md`

Rules are normative. If another document disagrees, this file wins; raise a change per `CHANGE_MANAGEMENT.md`. Rules marked **[OPEN]** depend on an unresolved decision and must not be implemented until it is closed.

## Ledger integrity
- **BR-001** A journal entry has at least two lines. Each line has exactly one positive amount, either debit or credit. Sum of debits equals sum of credits, in the organization's base currency. Enforced in the database, not only in the API.
- **BR-002** Amounts are integers in minor units (for example cents) plus an ISO 4217 code. No floating point anywhere in the money path.
- **BR-003** Posted entries are immutable. A correction is a new reversing entry that references the original, followed by a new correct entry. Nothing is updated or deleted.
- **BR-004** Posting into a closed period is rejected. Reopening a period needs the Owner role, a written reason, and an audit record. **[OPEN]** OQ-005 (who else may reopen).
- **BR-018** Trial Balance is computed from posted lines only; total debits equal total credits at all times and at every period close.
- **BR-019** Financial records are never hard-deleted. Personal data erasure is done by pseudonymizing party records, not by altering amounts. **[OPEN]** OQ-013.

## Money movement
- **BR-005** A transfer between two of the organization's own accounts debits the receiving account and credits the sending account. It never touches income or expense accounts. Fees are separate expense lines. Transfers in flight use a clearing account.
- **BR-006** Every account has an `ownership_type` of `business` or `personal`. Personal account balances are excluded from company statements. Movement between business and personal funds must be recorded as owner contribution, owner draw, or owner loan, never as income or expense.
- **BR-007** Investor capital is recorded as equity (Dr Bank, Cr Investor Capital), never revenue. If an investor's money is a loan, it is a liability instead. The type is selectable per investor/contribution agreement (both equity and loan supported, OQ-003 closed 2026-11-26).
- **BR-008** Account-type compatibility is enforced: transfers, capital, loan proceeds and owner contributions cannot be posted to income accounts.
- **BR-009** A personal expense paid from a business account is recorded as an owner draw or due-from-owner, never as a company expense. A company expense paid from personal funds is recorded as an expense with a payable to the owner. **[OPEN]** OQ-004 (reimbursement policy and tax treatment).

## Profit and ownership
- **BR-010** Profit-sharing agreements are versioned with `effective_from` and `effective_to`. Percentages in one version sum to exactly 100%. A closed distribution stores a snapshot of the percentages and profit base it used. Changing percentages never alters past distributions. Odd minor units from rounding are allocated via the largest-remainder method (OQ-027 closed 2026-11-26).
- **BR-011** Profit for distribution is net profit from the P&L for a closed period on an accrual basis (OQ-001 closed 2026-11-26; specific extraordinary exclusions remain configurable per agreement).
- **BR-012** Shareholding percentage, profit-sharing percentage and capital contributed are three separate attributes. None is derived from another unless an agreement states so.

## Operations
- **BR-013** Duplicate protection: unique on (organization, source, external_id) when an external id exists; otherwise a fingerprint of (account, date, amount, normalized description). Fingerprint matches are held for review. All write APIs accept an `Idempotency-Key`.
- **BR-014** Salary: accrue (Dr Salary Expense, Cr Salaries Payable), then pay (Dr Salaries Payable, Cr Bank). Manager profit share is separate from salary. Payroll tax is out of scope. **[OPEN]** OQ-009.
- **BR-015** Receivables and payables are open items settled by payment allocations; a settled item cannot be reopened except by reversal.
- **BR-016** Each foreign-currency line stores the original amount, currency, exchange rate, rate source and rate timestamp, plus the base-currency amount. Rounding and revaluation rules are **[OPEN]** OQ-006.
- **BR-017** An individual ledger (investor, manager, employee, supplier) is a filtered view of journal lines tagged with that party. It is not a separate copy of data.
- **BR-020** A bank statement line matches at most one set of ledger lines. A matched pair is locked until explicitly unmatched, and unmatching is audited.

## Control
- **BR-021** Every sensitive operation requires an explicit permission and writes an audit record. Sensitive means: posting, reversing, closing or reopening periods, changing roles, changing profit-sharing agreements, exporting data, changing bank details, managing API keys.
- **BR-022** No user, including Owner, can bypass BR-001 to BR-003. Platform staff have no access to tenant financial data unless a customer grants time-limited, audited support access. **[OPEN]** OQ-014.

## Worked example (BR-005 and BR-007)
Investor contributes 10,000 USD; bank receives 9,990 after a 10 USD wire fee.
| Entry | Debit | Credit |
|---|---|---|
| Capital | Bank 9,990.00 | Investor Capital 10,000.00 |
| | Bank Fees 10.00 | |
Revenue is unchanged. Transfer of 2,000 USD from Bank A to Bank B: Dr Bank B 2,000, Cr Bank A 2,000. Profit is unchanged.
