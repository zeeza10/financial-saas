# API Specification

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define API conventions, security requirements, versioning and the initial endpoint catalog. The OpenAPI file will be generated from the shared contracts.

**Related:** `ARCHITECTURE.md`, `AUTHORIZATION_RBAC_RLS.md`, `SECURE_CODING.md`, `ADR-0006-api-versioning.md`, `CHANGE_MANAGEMENT.md`

## 1. Conventions
- Base path `/v1`. JSON over HTTPS only. Request/response schemas come from `packages/contracts`.
- IDs are UUID strings. **Money is `{ "amount_minor": "12345", "currency": "USD" }` with the amount as a string** to avoid JavaScript precision loss.
- Dates ISO 8601 UTC. Pagination: cursor-based (`?limit=50&cursor=...`, max 200).
- Errors: RFC 9457 `application/problem+json` with `type`, `title`, `status`, `request_id`. No stack traces, SQL, or internal ids in errors.
- Write requests require `Idempotency-Key` (BR-013). Replays return the original result. Keys are scoped by (organization, user, route) and stored with a hash of the request body; reuse with a different body returns 422; keys expire after 24 hours (proposed). A key is never valid across organizations.
- Organization context is explicit: `X-Organization-Id` header or path segment, always re-checked against membership. Never trust a client-supplied role.
- Unknown fields are rejected (no mass assignment). Request body size limits per route.
- Rate limits per user, per organization, per IP; stricter for auth and export routes; `429` with `Retry-After`.
- CORS: explicit allow-list of origins, no wildcard with credentials.

## 2. Authentication
Browser: cookie session (ADR-0004). Integrations: hashed API keys with scopes, per organization, rotation and expiry. Details in `AUTH_SECURITY.md`.

## 3. Endpoint catalog (initial, MVP)
| Method and path | Permission | Notes |
|---|---|---|
| GET /v1/organizations | member | list my organizations |
| POST /v1/organizations | authenticated | create org, creator becomes Owner |
| GET/POST /v1/accounts | accounts:read / accounts:write | chart of accounts |
| GET/POST /v1/bank-accounts | banking:read / banking:write | |
| POST /v1/imports | transactions:import | CSV, async job |
| GET /v1/bank-transactions | banking:read | filter, paginate |
| POST /v1/journal-entries | ledger:draft | creates draft |
| POST /v1/journal-entries/{id}/post | ledger:post | atomic posting |
| POST /v1/journal-entries/{id}/reverse | ledger:post | requires reason |
| GET /v1/ledger, /v1/trial-balance, /v1/reports/{pnl,balance-sheet,cash-flow} | reports:read | |
| POST /v1/periods/{id}/close, /reopen | period:close / period:reopen | |
| GET /v1/audit-events | audit:read | |
| GET/POST/DELETE /v1/members | members:read / members:write | |
There is intentionally **no** update or delete endpoint for posted entries.

## 4. Versioning and deprecation
- Additive changes (new optional fields, new endpoints) stay within the version. Clients must ignore unknown response fields.
- Breaking changes require a new major version (`/v2`). The old version is supported for at least 12 months after announcement (proposed), with `Deprecation` and `Sunset` headers and changelog notice.
- Contract tests compare the generated OpenAPI against the previous release and fail CI on breaking diffs.

## 5. Webhooks (future)
Signed (HMAC with timestamp), replay-protected, retried with backoff, delivered only to allow-listed HTTPS URLs (SSRF controls in `SECURE_CODING.md`).

## 6. Documentation
OpenAPI 3.1 generated from contracts, published for authenticated users only until public launch.
