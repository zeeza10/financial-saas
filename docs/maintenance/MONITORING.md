# Monitoring and Alerting

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define what to measure and alert on for availability, security and financial integrity.

**Related:** `INCIDENT_RESPONSE.md`, `BACKUP_RECOVERY.md`, `DEPLOYMENT.md`, `THREAT_MODEL.md`

## 1. Signals
| Area | Signals | Alert (proposed) |
|---|---|---|
| Availability | Uptime check, 5xx rate, latency p95 | 5xx > 2% for 5 min; downtime > 2 min |
| Security | Failed logins, 401/403 spikes, 429 rates, CSP reports, WAF blocks, role changes, exports, API key use | Spikes vs baseline; any service-role query without org filter |
| Financial integrity | Nightly job: every organization's Trial Balance balanced, audit chain valid, unmatched duplicates, posting errors | Any imbalance or chain break = Sev 1 |
| Database | Connections, slow queries, RLS policy errors, replication/backup status, storage | Backup failure; connection saturation |
| Jobs | Queue depth, failures, retries | Failure > threshold |
| Cost | Worker requests, DB compute, egress | Budget thresholds |
| Dependencies | New vulnerabilities | High/Critical advisory |

## 2. Logging
Structured, request id, organization id (hashed where appropriate), no secrets, no financial payloads. Retention proposed 12 months, access restricted.

## 3. Dashboards and on-call
Dashboards per signal group; on-call owner named before launch; alerts route to a pager channel; runbooks linked from each alert.

## 4. Review
Monthly review of alerts, false positives, and gaps; update after each incident.
