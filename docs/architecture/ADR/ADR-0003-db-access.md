# ADR-0003: Database Access and Transactions from Workers

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Accepted (2026-11-26) |

**Purpose:** Record how the API Worker talks to Postgres and how atomic financial writes are guaranteed.

**Related:** `ARCHITECTURE.md`, `OPEN_QUESTIONS.md`, `DATABASE_SCHEMA.md`

**Status:** Accepted (2026-11-26; closes OQ-022).
**Context:** HTTP-based access cannot hold a multi-statement transaction; financial posting must be atomic.
**Decision:** For MVP, the Worker calls Postgres functions (RPC) over HTTPS with the user's JWT. Each function performs a whole business operation in one transaction (validate, write entry and lines, write audit event, write outbox event). Reads use RLS-protected views and RPC.
**Alternatives:** Hyperdrive direct Postgres connection with a driver and explicit transactions (more flexible, more connection and secret handling; revisit after measurement).
**Consequences:** Business-critical rules live in SQL and need strong SQL tests. TypeScript `ledger-core` mirrors validation for fast feedback and is tested against the SQL for parity.
