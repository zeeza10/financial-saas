# User Roles and Permissions

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define roles, the permission matrix and the rules for assigning roles, as the basis for RBAC and RLS policies.

**Related:** `AUTHORIZATION_RBAC_RLS.md`, `BUSINESS_RULES.md`, `AUTH_SECURITY.md`, `SECURITY_TEST_CASES.md`

## 1. Roles (organization level)
| Role | Intent |
|---|---|
| Owner | Full control of the organization, billing, and period reopen. At least one per organization. |
| Admin | Manages users, settings, accounts; cannot change Owner or reopen periods. |
| Accountant | Posts and reverses entries, closes periods, runs reports. |
| Manager | Enters and approves operational transactions in assigned scope; sees reports allowed by Owner. |
| Employee | Submits expenses; sees only own submissions and own payslips/ledger. |
| Investor | Read-only on own individual ledger, capital and distribution statements. |
| Auditor | Read-only on all financial records and the audit log; can export under audit. |

Platform-level roles (not tenant roles): **Platform Admin** (operates the service, no default tenant data access), **Support** (only with customer-granted, time-limited, audited access; OQ-014).

## 2. Permission matrix (R=read, W=create/edit draft, P=post, A=approve, X=export, -=none)
| Capability | Owner | Admin | Accountant | Manager | Employee | Investor | Auditor |
|---|---|---|---|---|---|---|---|
| View Chart of Accounts | R | R | R | R | - | - | R |
| Edit Chart of Accounts | W | W | W | - | - | - | - |
| Draft transactions | W | W | W | W | W (own) | - | - |
| Post / reverse entries | P | - | P | - | - | - | - |
| Approve expenses | A | A | A | A (scope) | - | - | - |
| Close period | P | - | P | - | - | - | - |
| Reopen period | P | - | - | - | - | - | - |
| Reports (company) | R | R | R | R (scope) | - | - | R |
| Individual ledger | R | R | R | R (own team) | R (own) | R (own) | R |
| Profit-sharing agreements | W | R | W | - | - | R (own) | R |
| Run distribution | P | - | P | - | - | - | - |
| Manage users and roles | W | W (not Owner) | - | - | - | - | - |
| Manage API keys / integrations | W | W | - | - | - | - | - |
| Export data | X | X | X | - | - | X (own) | X |
| View audit log | R | R | R | - | - | - | R |
| Billing | W | - | - | - | - | - | - |

## 3. Rules
1. A role grants nothing outside the organization it is assigned in.
2. Separation of duties (proposed, OQ-023): the user who drafts an entry above a configurable threshold should not be the one who approves it.
3. Role changes, invitations and removals are sensitive operations (BR-021) and are audited.
4. The last Owner cannot be removed or downgraded.
5. Investor and Employee users are linked to exactly one party record; they cannot see other parties' ledgers.
6. Permissions are defined once in a permission catalog (code and SQL generated from the same source, see `AUTHORIZATION_RBAC_RLS.md`).
