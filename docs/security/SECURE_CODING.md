# Secure Coding Standard

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Give developers and AI agents concrete coding rules that implement the threat model.

**Related:** `THREAT_MODEL.md`, `AI_CODING_RULES.md`, `API_SPECIFICATION.md`, `AUTH_SECURITY.md`, `SECURITY_TESTING.md`

## 1. General
- Validate all input at the edge with schemas (allow-list, types, ranges, lengths). Reject unknown fields. Revalidate in the database with constraints.
- Encode output for its context. Never build HTML, SQL, shell commands or URLs from raw strings.
- Fail closed. Errors to users are generic with a request id; details go to protected logs without secrets or financial payloads.
- No custom cryptography. Use platform libraries (Web Crypto) and vetted algorithms.

## 2. Rules by threat (see `THREAT_MODEL.md`)
- **T-01 XSS:** never use `dangerouslySetInnerHTML` or `innerHTML`; no `eval`/`new Function`; user text rendered as text; CSP with nonce; sanitize with a vetted library only if rich text is approved.
- **T-02 CSRF:** state-changing routes require POST/PUT/PATCH/DELETE, JSON content type, CSRF token and Origin check.
- **T-03 SQL injection:** use parameters or RPC arguments. If dynamic identifiers are unavoidable, use `format('%I')` with an allow-list and flag for security review.
- **T-04 SSRF:** do not fetch user-supplied URLs. If a feature needs it, use the allow-list design in the threat model and get review.
- **T-05/T-06 Access control:** every handler calls the central authorize function first; every query includes `organization_id`; tests prove a foreign id returns 404.
- **T-08 Mass assignment:** map request fields explicitly; never spread request bodies into DB writes.
- **T-10 CORS:** configure from an allow-list constant; no wildcard with credentials.
- **T-11 Uploads:** validate by content, limit size, random keys, no public URLs.
- **T-12 Secrets:** see `SECRETS_MANAGEMENT.md`. Never log tokens, keys, authorization headers, full bank data.
- **T-13 Dependencies:** add one only with a written reason; prefer standard APIs; commit lockfiles; no install scripts from unknown packages.
- **T-14 Abuse:** apply rate-limit middleware to every route; cap page sizes.
- **T-15 Races:** financial writes use idempotency keys and database locks inside one transaction.
- **T-16 Money:** integers only; use the shared money library; never `Number` for amounts above safe range; no rounding outside `ledger-core`.
- **T-19 CSV:** use the shared export helper that neutralizes formula prefixes.

## 3. Logging
Log who, what, when, request id, outcome. Do not log request bodies for financial routes. Redact by key name and pattern.

## 4. Code review focus
Authorization before data access, tenant scoping, input validation, error handling, new dependencies, migrations, secrets, tests added. Use `AI_REVIEW_CHECKLIST.md`.
