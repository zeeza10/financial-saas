# Threat Model

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Master list of threats, with prevention, detection and test mapping. Other security documents cite the T-IDs.

**Related:** `SECURE_CODING.md`, `SECURITY_TEST_CASES.md`, `AUTHORIZATION_RBAC_RLS.md`, `ARCHITECTURE.md`, `SECURITY_POLICY.md`

## 1. Assets
Ledger and financial records; personal data (parties, employees, investors); credentials and tokens; API keys; backups; audit log; source code and CI.

## 2. Actors
External attacker; malicious tenant user; compromised tenant account; curious or malicious insider (staff, support); compromised dependency; manipulated AI agent.

## 3. Trust boundaries
See `ARCHITECTURE.md` section 5.

## 4. Threat register
Test IDs `ST-nn` are defined in `SECURITY_TEST_CASES.md`.
| ID | Threat | Prevention | Detection | Test |
|---|---|---|---|---|
| T-01 | XSS (stored, reflected, DOM) via descriptions, party names, CSV content | React escaping by default; ban `dangerouslySetInnerHTML` (lint); sanitize rich text if ever allowed; strict CSP with nonces; no inline scripts; sanitized exports | CSP violation reports; WAF logs | ST-01 |
| T-02 | CSRF on cookie-session API | SameSite cookies, CSRF token, Origin and Sec-Fetch-Site checks, JSON content-type only, no state change on GET | Rejected-request metrics | ST-02 |
| T-03 | SQL injection | Parameterized queries and RPC arguments only; no dynamic SQL in functions except with `format(%I,%L)` after review; least-privilege DB roles | Static analysis (Semgrep), DB error spikes | ST-03 |
| T-04 | SSRF (webhooks, URL imports, file fetch) | No user-supplied URL fetching in MVP; if added: allow-list, block private/link-local/metadata ranges, resolve-and-pin DNS, no redirects, timeouts, egress controls | Egress logs, alerts on blocked ranges | ST-04 |
| T-05 | IDOR / BOLA on object ids | Every object lookup scoped by `organization_id` and permission; RLS; opaque UUIDs; 404 not 403 for foreign ids | Access-denied anomaly alerts | ST-05 |
| T-06 | Broken access control (function-level, BFLA) | Central permission catalog; deny by default; route-to-permission table tested for completeness | Authorization failure metrics | ST-06 |
| T-07 | Authentication and session attacks (credential stuffing, fixation, token theft) | MFA, breached-password check, rate limiting, session rotation, short-lived sessions, revocation, secure cookies | Failed-login alerts, impossible-travel flags | ST-07 |
| T-08 | Privilege escalation (role change, invite abuse, mass assignment) | Role changes need Owner/Admin permission, last-Owner rule, strict schemas, server sets role | Audit of role events | ST-08 |
| T-09 | Cross-tenant data leakage | ADR-0002: RLS forced, composite FKs, scoped queries, scoped cache keys and R2 prefixes, tenant-aware jobs; service role restrictions | Canary tenants in tests; query logs for missing org filter | ST-09 |
| T-10 | CORS misconfiguration | Explicit origin allow-list; no `*` with credentials; no reflected Origin | Config tests | ST-10 |
| T-11 | File upload attacks (malware, polyglot, path traversal, zip bombs, oversized) | Type allow-list by content sniffing, size limits, random storage keys, private bucket, scan (OQ-017), no execution, download with `Content-Disposition` and safe type | Scan results, upload anomaly alerts | ST-11 |
| T-12 | Secret leakage (repo, logs, browser, prompts, CI) | `SECRETS_MANAGEMENT.md`; secret scanning in pre-commit and CI; log redaction; no secrets in prompts | gitleaks alerts, provider leak notices | ST-12 |
| T-13 | Dependency and supply-chain attacks | Lockfiles, pinned versions, minimal dependencies, SCA in CI, review new packages, provenance where available, restricted CI permissions, pinned CI actions by SHA | Audit alerts, Dependabot/Renovate | ST-13 |
| T-14 | Rate limiting and abuse (brute force, scraping, expensive reports, enumeration) | Per user/org/IP limits, pagination caps, report quotas, Turnstile on public forms, generic auth errors | 429 rates, cost alerts | ST-14 |
| T-15 | Race conditions (double posting, double spend of an allocation, concurrent period close) | Idempotency keys, unique constraints, row locks (`SELECT ... FOR UPDATE`) or advisory locks inside posting functions, serializable where needed | Constraint-violation metrics | ST-15 |
| T-16 | Financial data manipulation (editing posted entries, unbalanced entries, backdating into closed periods, forged imports) | BR-001 to BR-004 in DB, reversal-only corrections, approval for large entries, import validation | Reconciliation breaks, daily integrity job | ST-16 |
| T-17 | Audit log tampering or suppression | Append-only grants, hash chain, scheduled verification, external anchor (OQ-021), alert on gaps | Chain verification alert | ST-17 |
| T-18 | AI agent prompt injection or unauthorized change (malicious text in repo, issues, docs, tool output) | `AI_SECURITY_RULES.md`: untrusted content rule, protected paths, human review, no production credentials | Diff review, CI protected-path checks | ST-18 |
| T-19 | CSV/formula injection in imports and exports | Neutralize leading `=`, `+`, `-`, `@` in exported cells; validate imports | Export tests | ST-19 |
| T-20 | Insider or support access abuse | No default staff access to tenant data (OQ-014); time-limited audited access; separation of duties | Access logs reviewed | ST-20 |

## 5. Residual risks (honest list)
- Privileged database roles can bypass triggers (ADR-0005).
- Supabase and Cloudflare are trusted third parties; their incidents affect us.
- Zero-day dependency flaws.
- Business logic flaws that only real-world use or a penetration test reveals (OQ-025).

## 6. Review
Update this model when a module is added, a trust boundary changes, or an incident occurs.
