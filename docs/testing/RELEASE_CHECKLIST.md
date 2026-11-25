# Release Checklist

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Gate that must be completed before every production release, including security approval.

**Related:** `SECURITY_TESTING.md`, `DEPLOYMENT.md`, `DATABASE_MIGRATIONS.md`, `AI_CHANGE_CONTROL.md`, `CHANGELOG.md`

Release owner (human) completes this list; attach evidence links. A release with any unchecked mandatory item is not approved.

**Quality**
- [ ] All CI checks green on the release commit; no skipped/removed tests in protected suites.
- [ ] Unit, database (pgTAP), integration, E2E and regression suites pass.
- [ ] Financial suite (FT-01 to FT-33 that apply) passes, including golden scenario.
- [ ] Multi-tenant isolation suite passes for all tables and endpoints.

**Security**
- [ ] Secret scan, SAST, dependency audit clean or approved time-limited exception (owner, expiry).
- [ ] No open Critical/High findings (`SECURITY_REMEDIATION_PLAN.md`).
- [ ] Security reviewer sign-off for any change to auth, RLS, ledger, migrations, secrets, CI.
- [ ] Security headers/CSP verified on staging; DAST baseline reviewed.
- [ ] Penetration test completed and findings handled (before first public launch).

**Data and operations**
- [ ] Migrations reviewed; header complete; recovery plan stated; tested on production-like snapshot.
- [ ] Recent backup verified; restore drill within the last quarter.
- [ ] Rollback or forward-fix plan written; feature flags set to safe defaults.
- [ ] Monitoring and alerts for new components in place.

**Compatibility and docs**
- [ ] OpenAPI breaking-change diff clean (or new version announced with deprecation notices).
- [ ] `CHANGELOG.md`, `USER_GUIDE.md`, `DOCUMENTATION_STATUS.md` updated.

**Approval**
- [ ] Product owner approval recorded (name, date). Production deployment executed by a human via the pipeline.
- [ ] Post-release smoke test and 24-hour watch completed.
