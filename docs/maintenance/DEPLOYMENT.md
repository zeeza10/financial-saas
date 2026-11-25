# Deployment

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Describe the planned deployment pipeline, environments, approvals and rollback. Nothing is deployed in this phase.

**Related:** `ENVIRONMENT_SETUP.md`, `RELEASE_CHECKLIST.md`, `DATABASE_MIGRATIONS.md`, `BACKUP_RECOVERY.md`, `ARCHITECTURE.md`

## 1. Pipeline (planned)
1. Pull request: lint, type check, unit, pgTAP, integration, security scans, build, preview deployment with a disposable database.
2. Merge to main (protected branch, required reviews, signed commits recommended).
3. Deploy to staging automatically; run E2E, DAST baseline, migration tests on an anonymized snapshot.
4. Production: manual approval by the product owner; the pipeline applies migrations then deploys the Worker and frontend. Humans and AI agents cannot deploy from a laptop.

## 2. Environments
local / preview / staging / production, each with separate Supabase projects, Cloudflare Workers/routes, R2 buckets and secrets (`SECRETS_MANAGEMENT.md`).

## 2a. CI/CD security
Protected main branch applying to administrators too; required reviews and status checks; CODEOWNERS enforced for protected paths; GitHub Actions pinned by commit SHA; minimal `GITHUB_TOKEN` permissions; no secrets exposed to workflows from forks; `pull_request_target` not used with untrusted code; short-lived credentials (OIDC) for cloud access where supported; separate deploy credentials per environment; build provenance and an SBOM generated per release.

## 3. Strategy
Feature flags for new modules; migrations expand-first; Worker versions deployed gradually where supported (verify Cloudflare gradual deployments); frontend and API versions kept compatible through one release.

## 4. Rollback
- Code: redeploy previous Worker/frontend version.
- Schema: follow recovery type in the migration header; most changes are forward-fix.
- Data: restore procedure in `BACKUP_RECOVERY.md`; ledger corrections via reversals.
- Flags: disable the module.

## 5. Post-deploy
Smoke tests, dashboards and alerts check (`MONITORING.md`), 24-hour watch, changelog entry.

## 6. Infrastructure as code
Cloudflare configuration (wrangler config, routes, WAF rules) and Supabase config live in Git and change through pull requests.
