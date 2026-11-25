# Secrets Management

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define how API keys, tokens and credentials are stored, used, rotated and kept out of code, logs, browsers and AI prompts.

**Related:** `SECURITY_POLICY.md`, `AI_SECURITY_RULES.md`, `ENVIRONMENT_SETUP.md`, `INCIDENT_RESPONSE.md`

## 1. Rules
1. No secret in source control, ever, including examples. Commit `.env.example` with placeholder names only.
2. Secrets live in Cloudflare Worker secrets (or Secrets Store), GitHub Actions encrypted secrets/environments, and the Supabase dashboard. Not in `wrangler.toml` plain variables, not in front-end bundles.
3. Anything shipped to the browser is public. Only the Supabase URL and the publishable/anon key may appear there; the **service role key never**.
4. Separate secrets per environment; production secrets are not available to preview, local or AI agent environments.
5. Least privilege: separate database roles for the API, jobs and migrations; scoped, expiring tokens for CI.
6. Rotation: on a schedule (proposed every 90 days for keys), immediately on suspected exposure or staff change. Rotation steps are documented per secret in the runbook.
7. Detection: secret scanning in pre-commit and CI (for example gitleaks), GitHub secret scanning with push protection, and provider leak alerts.
8. Logging redaction by key name and pattern; never print env vars in CI logs.
9. AI agents never receive production secrets, never print or request them, and never paste them into prompts (`AI_SECURITY_RULES.md`).

## 2. Inventory (to be completed during implementation)
Supabase service role key; Supabase JWT signing configuration; Cloudflare API tokens; R2 credentials; CSRF/cookie signing secret; webhook signing secrets; email provider key; monitoring tokens. Each entry records owner, location, scope, rotation date.

## 3. If a secret leaks
Revoke and rotate first, then investigate usage logs, then clean history if applicable (history cleanup does not make a leaked secret safe). Follow `INCIDENT_RESPONSE.md`.
