# ADR-0005: Ledger Immutability and Audit Hash Chain

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Record how posted records are protected from modification and how tampering is detected.

**Related:** `DATABASE_SCHEMA.md`, `BUSINESS_RULES.md`, `THREAT_MODEL.md`, `FINANCIAL_TEST_CASES.md`

**Status:** Proposed.
**Decision:** Enforce BR-001 to BR-003 with triggers, revoked privileges and a single posting function. Corrections use reversal entries. Audit events form a per-organization hash chain, verified on a schedule; anchoring externally is OQ-021.
**Alternatives:** Application-only immutability (rejected: any bug or direct query bypasses it); full event sourcing (heavier than needed).
**Consequences:** Database-level tests are mandatory. Privileged roles can still bypass triggers, so their use is restricted, logged and reviewed. Tamper evidence is not tamper prevention for a fully privileged attacker.
