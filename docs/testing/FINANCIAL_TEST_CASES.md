# Financial Test Cases

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Concrete, numeric test cases that verify the accounting invariants and business rules. Expected values are human-checkable.

**Related:** `BUSINESS_RULES.md`, `ACCOUNTING_MODEL.md`, `TESTING_STRATEGY.md`, `UNIT_TESTING.md`, `INTEGRATION_TESTING.md`

Amounts in USD. Each case maps to a rule. Cases are specifications; no tests exist yet.

| ID | Rule | Scenario | Expected result |
|---|---|---|---|
| FT-01 | BR-001 | Post entry: Dr Bank 100.00, Cr Sales 100.00 | Posted |
| FT-02 | BR-001 | Post entry: Dr Bank 100.00, Cr Sales 99.99 | Rejected; nothing written |
| FT-03 | BR-001 | Entry with one line only | Rejected |
| FT-04 | BR-001 | Line with both debit and credit, or zero amount | Rejected |
| FT-05 | BR-001 | Property: 10,000 random valid entries | All balanced; Trial Balance debits = credits |
| FT-06 | BR-005 | Transfer 2,000 from Bank A to Bank B | A -2,000, B +2,000; income, expense, profit unchanged |
| FT-07 | BR-005 | Transfer with 10 fee | Fee in expense; transfer lines still no income/expense |
| FT-08 | BR-007, BR-008 | Investor contributes 5,000 | Equity +5,000; revenue 0; profit unchanged; posting to Sales rejected |
| FT-09 | BR-006, BR-009 | Personal grocery 80 paid from business bank | Dr Owner Draws 80; company expenses unchanged; profit unchanged |
| FT-10 | BR-009 | Company software 50 paid personally by owner | Expense +50; Due to Owner 50 |
| FT-11 | BR-006 | Personal account balance 3,000 | Not on company Balance Sheet; separate personal view only |
| FT-12 | BR-010 | Agreement v1 60/40 effective Jan; close Jan with profit 2,490.00; change to 50/50 effective Feb | Jan distribution 1,494.00 / 996.00 forever; Feb uses 50/50 |
| FT-13 | BR-010 | Agreement percentages 60/39 | Rejected (must sum to 100) |
| FT-14 | BR-010 | Allocate 100.01 by 33.33/33.33/33.34 | Shares sum to exactly 100.01; who receives the remainder is blocked until OQ-027 is decided |
| FT-15 | BR-013 | Import same external_id twice | Second rejected; one entry |
| FT-16 | BR-013 | Two lines same account/date/amount/description, no external id | Second held for review, not auto-posted |
| FT-17 | BR-013 | Same Idempotency-Key sent twice (also concurrently) | One entry; same response |
| FT-18 | BR-011 | Sales 10,000; marketplace fees 1,300; COGS 4,000; shipping 600; subscriptions 100; bank fees 10; salaries 1,500; plus capital 5,000, transfer 2,000, owner draw 300 | Net profit 2,490.00 (excluded items change nothing) |
| FT-19 | BR-018 | After FT-18 postings | Trial Balance debits = credits; balance sheet: Assets = Liabilities + Equity |
| FT-20 | BR-003 | UPDATE or DELETE a posted line/entry (SQL, as every role) | Fails |
| FT-21 | BR-003 | Reverse entry E | Linked reversing entry; account balances return to pre-E; E unchanged |
| FT-22 | BR-003 | Reverse the same entry twice | Second rejected |
| FT-23 | BR-004 | Post dated in a closed period | Rejected |
| FT-24 | BR-004 | Reopen as Accountant / as Owner without reason / as Owner with reason | Rejected / rejected / allowed + audit |
| FT-25 | BR-015 | Pay 40 against a 100 bill, then 60 | Open balance 60, then 0; over-allocation rejected |
| FT-26 | BR-014 | Accrue 1,500 salary then pay | Payable 1,500 then 0; expense once |
| FT-27 | BR-020 | Match one bank line to two entries | Rejected; one match max; matched lines locked |
| FT-28 | BR-016 | EUR sale at stated rate | Original amount, rate, source, base amount stored; entry balanced in base; rounding rule from OQ-006 (blocked until decided) |
| FT-29 | BR-021 | Each sensitive operation | Exactly one audit event with actor and request id |
| FT-30 | BR-022 | Owner attempts to bypass balance or immutability | Impossible via API and DB |
| FT-31 | BR-017 | Individual ledger of investor | Sum of lines tagged to that party; equals entries; no other party's lines |
| FT-32 | BR-002 | Amount 9,007,199,254,740,993 minor units | Stored and returned exactly (string in JSON) |
| FT-33 | BR-008 | Marketplace payout (sale 100, fee 13) | Dr Clearing 87, Dr Fees 13, Cr Sales 100; bank deposit clears Clearing to 0 |
| FT-34 | BR-012 | Investor holds 70% shareholding but the agreement gives 50% profit share; profit 1,000.00 | Distribution to that investor is 500.00, not 700.00; capital contributed does not change either figure |
| FT-35 | BR-019 | Erasure request for a party with posted lines | Party personal fields pseudonymized; every ledger amount, entry and Trial Balance unchanged; hard delete of the party or its lines fails (legal retention rules blocked on OQ-013) |

## Golden scenario
FT-18/FT-19 is the golden scenario: stored in the protected `tests/financial` path with human-verified totals; any change in expected values requires owner approval (`AI_CHANGE_CONTROL.md`).
