# ADR-0006: API Versioning

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Record the API versioning and deprecation policy.

**Related:** `API_SPECIFICATION.md`, `CHANGE_MANAGEMENT.md`

**Status:** Proposed.
**Decision:** Major version in the path (`/v1`). Additive changes within a version. Breaking changes only in a new major version with at least a 12-month overlap (proposed) and `Deprecation`/`Sunset` headers. CI compares OpenAPI against the last release.
**Alternatives:** Header or date-based versioning (flexible, harder to route and cache).
**Consequences:** Contract tests and a published changelog are required; integrations such as the eBay Dashboard can upgrade on their own schedule.
