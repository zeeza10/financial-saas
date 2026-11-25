# User Flows

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Describe the main user journeys step by step, including failure paths, for design, development and E2E tests.

**Related:** `SRS.md`, `E2E_TESTING.md`, `BUSINESS_RULES.md`, `USER_ROLES.md`

## F1. Sign-up and organization creation
1. User signs up (email + password or SSO) and verifies email.
2. User enables MFA (required for Owner/Admin/Accountant, OQ-023).
3. User creates an organization: name, base currency, country, fiscal year start.
4. System seeds the Chart of Accounts from a template and creates the Owner membership.
Failure: unverified email blocks step 3; duplicate organization names are allowed (ids are unique).

## F2. Connect accounts and import transactions
1. Create bank/cash accounts, marking each business or personal (BR-006).
2. Upload CSV statement. System validates format, size and type, then parses server-side.
3. System detects duplicates (BR-013) and shows a review list.
4. User classifies lines (company/personal, category). Drafts are created; nothing is posted yet.
Failure: malformed file returns a line-level error report; no partial import.

## F3. Post a transaction
1. Accountant reviews a draft, selects accounts, and clicks Post.
2. Server validates permission, period open, account compatibility (BR-008), balance (BR-001).
3. Entry is posted atomically; audit record written.
Failure: unbalanced or closed-period entries are rejected with a clear message.

## F4. Transfer between accounts
User chooses source and destination accounts and an amount. System posts Dr destination, Cr source (BR-005). Report totals for income and expense do not change.

## F5. Correct a mistake
Accountant opens a posted entry, chooses Reverse, supplies a reason. System posts a reversing entry linked to the original; user then posts the corrected entry. Original remains visible (BR-003).

## F6. Reconcile a bank statement
User selects account and statement date; system proposes matches; user confirms or rejects; matched lines lock (BR-020). Difference must be zero to complete.

## F7. Close a period
Accountant runs pre-close checks (Trial Balance balanced, no drafts older than period end, reconciliations complete), then closes. System stores the Trial Balance hash. Reopen requires Owner and a reason (BR-004).

## F8. Profit distribution (R2)
Owner/Accountant selects a closed period; system computes profit (BR-011), applies the agreement version effective in that period (BR-010), shows a preview; on confirm it posts the distribution and stores the snapshot.

## F9. Investor self-service (R2)
Investor logs in, sees own capital, distributions and ledger only. Attempts to open other ids return 404.

## F10. User lifecycle
Owner invites by email; invitee accepts and gets the assigned role. Removal revokes sessions immediately and is audited. Data export is available to Owner/Auditor.
