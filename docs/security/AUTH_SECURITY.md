# Authentication and Session Security

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Specify identity, credentials, MFA, session handling and account recovery requirements.

**Related:** `ADR-0004-session-model.md`, `SECURE_CODING.md`, `USER_ROLES.md`, `SECURITY_TEST_CASES.md`, `OPEN_QUESTIONS.md`

## 1. Identity
Supabase Auth is the identity provider. The API Worker verifies tokens using the provider's published signing keys, checks issuer, audience, expiry and algorithm (reject `none` and unexpected algorithms), and then loads organization membership from the database. Roles are never taken from client claims alone.

## 2. Credentials
- Passwords: minimum length 12, check against breached-password lists, no composition rules that encourage weak patterns. (Verify which options Supabase provides before relying on them.)
- Email verification required. SSO (Google/Microsoft) optional later.
- Account enumeration prevented: same responses and timing for known and unknown emails on login, reset and signup where practical.

## 3. MFA
TOTP (or WebAuthn when available) is **required** for `Owner`, `Admin`, and `Accountant` roles (OQ-023 closed 2026-11-26). Recovery codes are stored hashed. Re-authentication is required for sensitive actions (period reopen, role change, API key creation, data export).

## 4. Sessions (per ADR-0004, proposed)
- httpOnly, Secure, SameSite cookies, `__Host-` prefix, short idle and absolute timeouts, rotation on login and privilege change.
- Logout and role removal revoke sessions server-side.
- Concurrent session list with remote revoke.
- CSRF defenses per `SECURE_CODING.md`.

## 5. Brute-force and abuse
Rate limit by account and IP; progressive delays; Turnstile on signup and reset; alerts on spikes.

## 6. Account recovery
Time-limited single-use links; notify on email or MFA change; MFA reset requires identity verification and is audited. Support must not be able to bypass MFA silently.

## 7. API keys (integrations)
Random 256-bit keys shown once, stored hashed, scoped to one organization and specific permissions, with expiry, rotation, last-used time and instant revoke. Never accepted in query strings.

## 8. Logging
Log login success/failure, MFA events, password changes, session revocations (no credentials).
