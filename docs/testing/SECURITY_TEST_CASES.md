# Security Test Cases

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Concrete security test cases mapped to the threat register (ST-nn matches T-nn).

**Related:** `THREAT_MODEL.md`, `SECURITY_TESTING.md`, `AUTHORIZATION_RBAC_RLS.md`, `AUTH_SECURITY.md`

Each ST maps to the threat with the same number in `THREAT_MODEL.md`. Cases are specifications; none has been run.

| ID | Test cases |
|---|---|
| ST-01 XSS | Payloads (`<script>`, `<img onerror>`, SVG, `javascript:` URLs) in names, descriptions, memo, CSV cells render as inert text everywhere; CSP blocks inline script; lint blocks `dangerouslySetInnerHTML`. |
| ST-02 CSRF | State-changing request without token, with wrong token, from other Origin, via simple form post: all rejected. GET never changes state. |
| ST-03 SQLi | Injection strings in every string parameter, sort/filter fields and RPC args: no error leakage, no behavior change; Semgrep finds no string-built SQL. |
| ST-04 SSRF | If URL-taking features exist: internal IPs, metadata endpoints, DNS rebinding, redirects, IPv6 forms all blocked. Otherwise test asserts no such feature exists. |
| ST-05 IDOR/BOLA | For every `{id}` endpoint, user B requests org A's id: 404; list endpoints never include A's rows; guessing sequential/duplicate ids fails. |
| ST-06 Access control | Each endpoint x role matrix equals the permission catalog; missing permission mapping fails CI; direct function calls by `anon`/`authenticated` that should be private are denied. |
| ST-07 Auth/session | Brute force locks/throttles; session fixation; token with wrong issuer/audience/alg `none`/expired rejected; session revoked after logout and role removal; MFA required for privileged roles. |
| ST-08 Privilege escalation | Employee tries to set own role, invite Owner, change `organization_id`/`role` via body (mass assignment): rejected; last Owner cannot be removed. |
| ST-09 Cross-tenant leakage | Canary orgs: every table and endpoint tested for read/write/reference across tenants, including joins, views, reports, exports, search, cache keys, queue jobs, files; service-role job tests prove org scoping. |
| ST-10 CORS | Disallowed Origin gets no CORS headers; no wildcard with credentials; preflight behaves. |
| ST-11 File upload | Wrong type, polyglot, oversize, double extension, path traversal name, zip bomb, EICAR test file: rejected/quarantined; direct bucket URL not public; signed URL expires and is org-bound. |
| ST-12 Secrets | Seeded fake secret in a branch is caught by gitleaks; build artifacts contain no service role key; logs redact tokens. |
| ST-13 Supply chain | CI fails on known-critical vulnerabilities; lockfile changes need review; unpinned CI actions flagged. |
| ST-14 Rate limiting | Login, reset, import, export, report endpoints return 429 beyond limits; page size cap enforced; enumeration responses uniform. |
| ST-15 Races | 50 concurrent identical posts -> 1 entry; concurrent reversal -> 1 reversal; concurrent close/post; allocation over-pay under concurrency rejected. |
| ST-16 Financial manipulation | FT-02, FT-20 to FT-24 executed through API, SQL as each role, and with crafted payloads (negative amounts, huge values, wrong currency, backdated). |
| ST-17 Audit log | Update/delete/truncate on audit table fails for all app roles; chain verifier detects an edited row in a test copy; missing event for a sensitive action fails the test. |
| ST-18 AI agent injection | Test repository with malicious instructions in a README/issue/tool output: agent evaluation shows refusal and report; CI blocks edits to protected paths and removed tests without approval label. |
| ST-19 CSV/formula | Cells starting with `=`, `+`, `-`, `@` are neutralized in exports; malformed CSV import handled safely. |
| ST-20 Insider/support | Support role cannot read tenant data without an active, time-limited customer grant; grant use is audited and expires. |

## Reporting
Results recorded per release in `RELEASE_CHECKLIST.md`. Findings follow severity rules in `SECURITY_TESTING.md`.
