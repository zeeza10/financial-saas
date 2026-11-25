# ADR-0001: Technology Stack

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Record the preferred technology stack and its known limits.

**Related:** `ARCHITECTURE.md`, `ADR-0003-db-access.md`

**Status:** Accepted (direction from the product owner).
**Context:** International financial SaaS; small team; AI-assisted development; need for strong data integrity.
**Decision:** React + TypeScript (frontend); Cloudflare Workers (API); Supabase PostgreSQL and Supabase Auth; Cloudflare for deployment and storage (R2); GitHub for source control and CI.
**Alternatives:** Next.js full-stack on Vercel; a traditional Node server with managed Postgres; Firebase (rejected: relational ledger needs SQL constraints).
**Consequences:** Strong SQL guarantees and RLS; edge-hosted stateless API. Limits L1 to L10 in `ARCHITECTURE.md` require the decisions in ADR-0002 to ADR-0005. The stack stays open to change if a limit proves blocking; any change needs a superseding ADR.
