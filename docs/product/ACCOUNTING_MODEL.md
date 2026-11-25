# Accounting Model

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Explain how the ledger, account types and the separated financial concepts (business, personal, investor, profit-sharing) fit together.

**Related:** `BUSINESS_RULES.md`, `DATABASE_SCHEMA.md`, `FINANCIAL_TEST_CASES.md`, `OPEN_QUESTIONS.md`

## 1. Core model
Double-entry ledger. A **journal entry** has **journal lines**. Each line hits one **account** with a debit or credit. Reports are computed from posted lines only (BR-001, BR-003, BR-018).

Account types and normal balance:
| Type | Normal balance | Examples |
|---|---|---|
| Asset | Debit | Business Bank, Cash, Receivables, Inventory, Due from Owner |
| Liability | Credit | Payables, Salaries Payable, Investor Loans, Due to Owner |
| Equity | Credit | Investor Capital, Retained Earnings, Owner Draws (contra, debit) |
| Income | Credit | Sales, Shipping Income |
| Expense | Debit | Marketplace Fees, Shipping, COGS, Salaries, Subscriptions |

## 2. Keeping concepts separate
| Concept | How it is modeled | Must never |
|---|---|---|
| Business Bank Balance | Asset accounts with `ownership_type=business` | include personal accounts |
| Personal Bank Balance | Accounts with `ownership_type=personal`, excluded from company reports | appear on company Balance Sheet |
| Business Profit | Income minus Expense for a period (basis: OQ-001) | include capital, transfers, loan proceeds |
| Investor Capital | Equity (or liability if loan, OQ-003), tagged to investor party | be posted as income |
| Shareholding | Attribute on the investor/party record, versioned | be assumed equal to profit share |
| Profit Sharing | Versioned agreement + closed distribution snapshot | change after distribution closes |
| Individual Expenses | Posted to Owner Draws / Due from Owner, tagged to the person | reduce company profit |
| Company Expenses | Expense accounts | include personal items |
| Assets / Liabilities | Balance Sheet accounts, with registers for fixed assets and loans | be netted without disclosure |
| Receivables / Payables | Open-item sub-ledgers on Receivable/Payable control accounts | be settled without allocation |

## 3. Standard postings
| Event | Debit | Credit |
|---|---|---|
| eBay sale payout (gross sale 100, fee 13, net 87) | Marketplace Clearing 87; Marketplace Fees 13 | Sales 100 |
| Payout hits bank | Business Bank 87 | Marketplace Clearing 87 |
| Transfer A to B | Bank B | Bank A |
| Investor capital | Bank | Investor Capital |
| Owner personal spend from business bank | Owner Draws | Business Bank |
| Company spend paid by owner personally | Expense | Due to Owner |
| Salary accrued / paid | Salary Expense / Salaries Payable | Salaries Payable / Bank |
| Profit distribution to partner | Retained Earnings (or Distributions) | Due to Partner, then Bank on payment |
| Reversal of entry E | Lines of E with debit and credit swapped | (same) |

The marketplace clearing pattern is the same idea used by A2X (payouts reconciled to sales and fees); the design here is our own. Sales tax/VAT treatment is **[OPEN]** OQ-007.

## 4. Period handling
Open, Closed, Locked states. Closing snapshots the Trial Balance hash. Profit distributions require a Closed period (BR-010, BR-011).

## 5. Currency
Base currency per organization. Lines carry original and base amounts (BR-016). Realized/unrealized FX gain-loss policy is **[OPEN]** OQ-006.

## 6. Basis and policy decisions not made here
Cash vs accrual, inventory costing method (FIFO/average), depreciation method, revenue recognition for refunds and chargebacks, and tax are open: inventory costing OQ-002, depreciation OQ-008, refunds/chargebacks OQ-010, tax OQ-007 and OQ-011 (see `OPEN_QUESTIONS.md`). Nothing in this file decides them.
