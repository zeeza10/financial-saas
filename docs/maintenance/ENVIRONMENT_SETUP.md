# Environment Setup

| Field | Value |
|---|---|
| Version | 0.2.0 |
| Last updated | 2026-11-26 |
| Status | Active — local runner ready |

**Purpose:** Explain how a developer or agent sets up a local environment safely, without production secrets.

**Related:** `SECRETS_MANAGEMENT.md`, `DEPLOYMENT.md`, `TESTING_STRATEGY.md`, `AI_WORKFLOW.md`

## 1. Prerequisites
Node.js 22+ LTS, npm (or pnpm), Git; optional for local Postgres/Worker parity: Docker Desktop, Supabase CLI, Cloudflare Wrangler.

## 2. Steps
1. Clone `zeeza10/financial-saas`; read `AGENTS.md` and `docs/ai/AI_CONTEXT.md`.
2. Copy `.env.example` to `.env.local` (and `.dev.vars` for Workers) using **local/synthetic** values only. Never copy production values.
3. Install dependencies: `npm install`.
4. Verify checks: `node scripts/check-test-integrity.mjs`, `node scripts/check-rls-coverage.mjs`, `npm run lint`, `npm run typecheck`, `npm test`, `npm run build`.
5. Run locally (offline in-memory mode, zero external accounts needed):
   - Terminal 1: `npm run dev:api:local` (starts API on `http://127.0.0.1:8787`)
   - Terminal 2: `npm run dev:web` (starts React app on `http://127.0.0.1:5173`)
6. When Docker + Supabase CLI are installed: run `supabase start`, apply `supabase/migrations/0001..0003`, and execute `supabase/tests/01..03`.

## 3. Rules
- `.env*` files (except `.env.example`) are ignored by Git; pre-commit hook runs secret scanning.
- Local databases contain synthetic data only.
- AI agents run in sandboxes without production credentials (`AI_SECURITY_RULES.md`).

## 4. Troubleshooting log
Record recurring setup problems and fixes here once implementation starts.
