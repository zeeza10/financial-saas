# Data Protection and Privacy

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Define data classification, encryption, retention, privacy and file-storage rules.

**Related:** `SECURITY_POLICY.md`, `BACKUP_RECOVERY.md`, `BUSINESS_RULES.md`, `OPEN_QUESTIONS.md`

## 1. Classification
| Class | Examples | Handling |
|---|---|---|
| Restricted | Credentials, API keys, MFA secrets, full bank numbers (not stored) | Never stored in plain text; never logged |
| Confidential | Ledger, invoices, salaries, investor data, personal data | RLS, encryption, access logged |
| Internal | Config, logs without payloads | Staff only |
| Public | Marketing, docs | None |

## 2. Encryption
TLS 1.2+ everywhere with HSTS; encryption at rest provided by Supabase and Cloudflare (verify and record the provider guarantees). Consider application-level encryption for especially sensitive fields (for example tax ids) in a later phase; decision pending.

## 3. Minimization
Store only what is needed: bank account last 4 digits, no card numbers, no unnecessary personal data on parties. No real customer data in non-production environments; use anonymized snapshots.

## 4. Retention and erasure
Financial records may be legally required for years, varying by country (OQ-011, OQ-013). Ledger amounts are kept; personal fields on party records can be pseudonymized on a valid erasure request (BR-019). Retention schedule is a legal decision, not a technical guess.

## 5. Files
Private R2 bucket, key prefix per organization, random object names, content-type validation, size limits, malware scan (OQ-017), short-lived signed URLs, no public listing, deletion lifecycle after parent record rules.

## 6. Privacy and legal
Privacy policy, data processing agreement, subprocessor list (Supabase, Cloudflare, email provider), breach notification duties (for example GDPR 72 hours) to be reviewed by counsel. Data residency options: OQ-012.

## 7. Exports
Exports are permissioned, audited, rate limited, neutralize spreadsheet formulas (T-19), and use expiring download links.
