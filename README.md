# Financial Management SaaS

An AI-ready, modular Financial Management SaaS platform for businesses to manage accounting, income, expenses, banking, investments, cash flow, assets, liabilities, and financial reporting through a secure, scalable, multi-tenant architecture.

Built with React + TypeScript, Cloudflare Workers, Supabase PostgreSQL & Auth, and Cloudflare R2.

> **Source of Truth:** Read [AGENTS.md](./AGENTS.md) and [docs/DOCUMENTATION_INDEX.md](./docs/DOCUMENTATION_INDEX.md) before making changes.  
> **Scope Boundary:** This is an independent product. Do not modify or rebuild the separate MultiAcc / eBay Multi-Account Dashboard.

## Repository Layout

```text
apps/web              React + TypeScript frontend (Cloudflare Pages)
apps/api              Cloudflare Worker API /v1 + BFF sessions (never holds service_role key)
apps/jobs             Cloudflare Worker for Queues & Cron (org-scoped background jobs)
packages/contracts    Shared Zod schemas, OpenAPI 3.1 contracts, RBAC permission catalog
packages/ledger-core  Pure TypeScript domain engine (bigint minor units, rules, rounding)
packages/storage      Modular object storage abstraction (Cloudflare R2 / local adapter)
modules/              Isolated domain modules (only ledger writes to ledger tables)
supabase/migrations   Version-controlled SQL migrations
supabase/tests        pgTAP tenant-isolation, RLS, and ledger immutability tests
tests/financial       Protected golden financial test suites (FT-01..FT-35)
tests/security        Protected security test suites (ST-01..ST-20)
docs/                 Normative product, architecture, security, testing, and audit docs
```

## Key Architectural Decisions (Accepted)

- **Stack (`ADR-0001`):** React + TypeScript, Cloudflare Workers, Supabase Postgres/Auth, Cloudflare R2.
- **Database Access (`ADR-0003`):** Postgres RPC functions over HTTPS with user JWT for atomic transactions.
- **Sessions (`ADR-0004`):** BFF `httpOnly`, `Secure`, `SameSite` session cookies + CSRF protection.
- **Accounting Policies:** Accrual basis (`OQ-001`), gapless per-org entry numbers (`OQ-026`), largest-remainder rounding (`OQ-027`), selectable Equity/Loan per investor (`OQ-003`), staged milestones `M01–M08 -> R2 -> R3` (`OQ-020`) with billing-ready schema (`OQ-019`).

## Local Setup (Planned)

See [docs/maintenance/ENVIRONMENT_SETUP.md](./docs/maintenance/ENVIRONMENT_SETUP.md). Copy `.env.example` to `.env.local` (and `.dev.vars` for Workers) using **local/synthetic credentials only**.
