# Security Policy

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** State the security objectives, standards followed, responsibilities and mandatory controls for the product and its development.

**Related:** `THREAT_MODEL.md`, `SECURE_CODING.md`, `AUTH_SECURITY.md`, `AUTHORIZATION_RBAC_RLS.md`, `DATA_PROTECTION.md`, `SECRETS_MANAGEMENT.md`, `SECURITY_TESTING.md`, `INCIDENT_RESPONSE.md`, `BACKUP_RECOVERY.md`, `AI_SECURITY_RULES.md`

## 1. Objectives
Confidentiality of tenant financial data; integrity of the ledger; availability within agreed objectives; accountability through audit; safe AI-assisted development.

## 2. Standards used as guidance
OWASP Top 10, OWASP ASVS (target Level 2 for the application, Level 3 considered for ledger and auth components), OWASP API Security Top 10 (2023), OWASP Cheat Sheet Series, and OWASP guidance on LLM and agentic applications for the AI workflow. Verify the current edition of each before mapping controls in `SECURITY_TESTING.md`; this package was written from general knowledge without re-checking each standard online. This policy is guidance, not a compliance certification.

## 3. Mandatory controls (summary)
1. Authorization on the server for every request; RLS on every tenant table (`AUTHORIZATION_RBAC_RLS.md`).
2. Strong authentication with MFA for privileged roles (`AUTH_SECURITY.md`).
3. Input validation, output encoding, parameterized queries (`SECURE_CODING.md`).
4. Immutable ledger and tamper-evident audit log (ADR-0005).
5. Secrets only in managed secret stores; never in code, logs, prompts or the browser (`SECRETS_MANAGEMENT.md`).
6. Encrypted transport and storage; data minimization (`DATA_PROTECTION.md`).
7. Automated security checks in CI and manual review of sensitive changes (`SECURITY_TESTING.md`, `AI_CHANGE_CONTROL.md`).
8. Tested backups and an incident process (`BACKUP_RECOVERY.md`, `INCIDENT_RESPONSE.md`).

## 4. Responsibilities
| Role | Responsibility |
|---|---|
| Product owner | Accept residual risk, decide open security questions, approve production changes |
| Security reviewer (human, named before implementation) | Review sensitive changes, triage findings |
| Developers and AI agents | Follow `SECURE_CODING.md` and `AGENTS.md`; never self-approve |

## 5. Exceptions
A security exception must be written, time-limited, approved by the product owner, and recorded in `CHANGE_MANAGEMENT.md` records. Silent weakening of a control is a policy violation.

## 6. Disclosure
Publish a `security.txt` and a reporting address at launch. Triage per `INCIDENT_RESPONSE.md`.

## 7. Limits of this document
Passing a documentation review does not make the application secure. Security is shown by implemented controls, passing tests, and independent testing (OQ-025).
