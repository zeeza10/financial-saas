# Architecture Decision Records (ADR)

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Explain how architectural decisions are recorded and list all ADRs.

**Related:** `ARCHITECTURE.md`, `CHANGE_MANAGEMENT.md`, `OPEN_QUESTIONS.md`

Format: Context, Decision, Alternatives, Consequences, Status (Proposed, Accepted, Superseded). An ADR is never deleted; it is superseded by a newer one.

| ADR | Title | Status |
|---|---|---|
| ADR-0001 | Technology stack | Accepted (product owner's stated direction) |
| ADR-0002 | Multi-tenancy with organization_id and RLS | Proposed |
| ADR-0003 | Database access path and transactions from Workers | Accepted (2026-11-26, OQ-022) |
| ADR-0004 | Browser session model | Accepted (2026-11-26, OQ-015) |
| ADR-0005 | Ledger immutability and audit hash chain | Proposed |
| ADR-0006 | API versioning | Proposed |

"Proposed" means a human must review and accept it before implementation depends on it.
