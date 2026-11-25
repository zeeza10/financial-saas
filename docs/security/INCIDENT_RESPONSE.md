# Incident Response

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Provide a practical process for detecting, containing, investigating and recovering from security and data incidents.

**Related:** `SECURITY_POLICY.md`, `BACKUP_RECOVERY.md`, `SECRETS_MANAGEMENT.md`, `MONITORING.md`

## 1. Severity
| Sev | Definition | Response target (proposed) |
|---|---|---|
| 1 | Confirmed cross-tenant exposure, ledger tampering, credential/key compromise, data breach | Start within 1 hour, 24x7 reachable owner |
| 2 | Suspected exposure, auth bypass without exploitation, sustained outage | 4 hours |
| 3 | Limited, contained issue | 1 business day |

## 2. Roles
Incident lead (decides), investigator, communications owner, scribe. A named deputy exists for each. Names are filled before launch.

## 3. Phases
1. **Detect and triage:** alert, report, or customer ticket; assign severity; open an incident record with timeline.
2. **Contain:** revoke sessions and keys, rotate secrets, disable affected feature flag or endpoint, block attacker, preserve evidence (logs, database snapshots) before changes.
3. **Eradicate:** fix root cause; review related code paths and tenants.
4. **Recover:** restore from backup if integrity is in doubt (`BACKUP_RECOVERY.md`); verify with the Trial Balance and audit-chain checks.
5. **Notify:** affected customers and regulators as required by law and contracts (for example GDPR 72 hours; obtain legal advice).
6. **Review:** blameless post-incident review within 5 business days; update threat model, tests and runbooks.

## 4. Specific playbooks (to be expanded)
- **Cross-tenant leak:** disable affected endpoint, identify tables/policies, query logs to determine which organizations were read, notify.
- **Leaked secret:** rotate, review usage, see `SECRETS_MANAGEMENT.md`.
- **Suspected ledger tampering:** freeze posting, run audit-chain and Trial Balance verification, compare with last good backup.
- **Compromised account:** revoke sessions, force MFA reset, review audit trail.
- **Compromised dependency:** pin to a safe version, rebuild, rotate any secrets the build had.

## 5. Evidence and logging
Time-synced, immutable log retention (proposed 12 months), access to logs restricted.
