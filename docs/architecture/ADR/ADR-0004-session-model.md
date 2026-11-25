# ADR-0004: Browser Session Model

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Accepted (2026-11-26) |

**Purpose:** Record how browser sessions are held and protected.

**Related:** `AUTH_SECURITY.md`, `SECURE_CODING.md`, `OPEN_QUESTIONS.md`

**Status:** Accepted (2026-11-26; closes OQ-015).
**Context:** Storing access/refresh tokens in browser storage lets any XSS exfiltrate them. Financial data raises the impact.
**Decision:** Backend-for-frontend. The Worker completes Supabase Auth flows and issues an httpOnly, Secure, SameSite cookie session; the browser never sees refresh tokens. CSRF defenses are mandatory (token plus Origin/Fetch-Metadata checks).
**Alternatives:** supabase-js with tokens in localStorage (simpler, higher XSS impact); in-memory tokens only (poorer UX on refresh).
**Consequences:** More backend work and CSRF handling; smaller blast radius for XSS. A strict CSP and no `dangerouslySetInnerHTML` remain required either way.
