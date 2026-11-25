# Security Audit Report (Documentation Review)

| Field | Value |
|---|---|
| Version | 0.1.0 (Draft) |
| Last updated | 2026-11-26 |
| Status | Draft - pending human review |

**Purpose:** Review the documentation package against the 15 audit questions and report findings by severity. This reviews documents only; it is not a security assessment of an application, because no application exists.

**Related:** `DOCUMENTATION_GAP_REPORT.md`, `SECURITY_REMEDIATION_PLAN.md`, `PROJECT_READINESS_REPORT.md`, `THREAT_MODEL.md`, `OPEN_QUESTIONS.md`

## 1. Scope, method and honest limits
- **Reviewed:** all Markdown documents in this package plus `AGENTS.md`.
- **Method:** read-through against the 15 audit questions and OWASP-style guidance (Top 10, ASVS, API Security Top 10, LLM/agentic guidance), plus a script that checks headers, cross-references and ID coverage.
- **Limit 1 - not independent.** The same AI that wrote the package performed this review. It shares the author's blind spots. A human security reviewer and, before launch, an external penetration test are still required (OQ-025).
- **Limit 2 - no code.** Nothing here proves that any control works. Statuses below mean "adequately specified", never "implemented" or "secure".
- **Limit 3 - standards not re-verified.** OWASP editions and platform limits (Cloudflare, Supabase) come from general knowledge and were not re-read online for this review (finding F-09, F-10).
- **Limit 4 - legal and accounting content** needs qualified professionals.

The application is **not** declared secure. Passing this documentation review does not make it so.

## 2. Automated consistency check (script)
Checks: version/date header on every file; every referenced document exists; all BR, OQ, T, ST and FT ids used are defined; every business rule has a financial test; every threat has a security test; every open question is referenced outside the register; no duplicate section numbers; required files exist.
First run found defects: broken references to files not yet written (expected), BR-012 and BR-019 without tests, six open questions never referenced, a duplicate section number, a duplicate related-link, and a reference to a non-existent folder. All were fixed (F-17, F-18). The script cannot detect semantic contradictions between documents; see `DOCUMENTATION_GAP_REPORT.md`.

## 3. Results for the 15 questions
Legend: **Pass** = adequately documented (not verified in code); **Partial** = documented with gaps; **Pending** = cannot be determined without implementation; **Fail** = not addressed.
| # | Question | Result | Evidence and gaps | Findings |
|---|---|---|---|---|
| 1 | Are all important security risks documented? | Pass | 20 threats T-01..T-20 with prevention, detection, tests; residual risks listed in `THREAT_MODEL.md` | F-09 |
| 2 | XSS, CSRF, SQLi, SSRF, IDOR, BOLA, auth, authorization addressed? | Partial | All present in threat model, coding rules, tests. CSRF and session defenses depend on undecided ADR-0004 | F-01 |
| 3 | Is Supabase RLS part of the multi-tenant design? | Pass | ADR-0002, `AUTHORIZATION_RBAC_RLS.md`, `DATABASE_SCHEMA.md`; audit added the direct Data API assumption | F-15 |
| 4 | Can one organization access another's financial records? | Pending | Design says no (RLS forced, composite FKs, scoped jobs, canary tests). Truth can only be shown by running the isolation suite on real code | F-04 |
| 5 | Are financial transactions protected against unauthorized modification? | Partial | Immutability by triggers, revoked privileges, reversal-only corrections, hash-chained audit (ADR-0005). Privileged DB roles can bypass; anchoring undecided | F-05 |
| 6 | Are API keys and secrets protected? | Partial | Strong rules and scanning; service-role separation added during audit; inventory empty | F-04 |
| 7 | Are AI agent instructions protected against prompt injection and unauthorized change? | Partial | Untrusted-content rule, authority order, protected paths. But `AGENTS.md` is advisory; CODEOWNERS, branch protection and CI checks are not configured | F-06 |
| 8 | Are existing tests protected against deletion or weakening? | Partial | CI test-integrity checks specified (no skip, assertion counts, protected paths). No tests or CI exist yet | F-06 |
| 9 | Are migrations reversible or safely recoverable? | Pass | Reversibility policy by change type, header, expand/contract, branch testing. Recovery depends on backups | F-07 |
| 10 | Backup and disaster recovery documented? | Partial | Scope, restore steps, drills documented; RPO/RTO unapproved; per-tenant restore unwritten | F-07 |
| 11 | Are financial calculations and double-entry rules consistent? | Partial | Rule ids cross-checked against tests (35 financial cases) and the accounting model. Core policies undecided (profit basis, FX, rounding, numbering) | F-02 |
| 12 | Can new modules be added without breaking existing ones? | Pass | Module boundaries, ledger-only writes, events, flags, checklist | - |
| 13 | API versioning and backward compatibility addressed? | Pass | ADR-0006, `API_SPECIFICATION.md`, OpenAPI diff gate | - |
| 14 | Sensitive operations subject to permissions and audit logging? | Pass | BR-021 list, permission matrix, audit events, test FT-29 | F-13 |
| 15 | Security testing and release approval clearly defined? | Partial | Gates, cadence, severities, release checklist defined; ASVS mapping not done; pen test unscheduled | F-09, F-20 |

**Totals: Pass 6, Partial 8, Pending 1, Fail 0.** A Fail count of zero should be read with limit 1 in mind.

## 4. Findings
Severity: **Critical** = must be resolved before the affected area is implemented; **High** = serious weakness to close before pilot users; **Medium** = close before public launch; **Low** = housekeeping. Status: Open, Fixed in docs (still unverified in code), Pending implementation.
| ID | Sev | Finding | Status |
|---|---|---|---|
| F-01 | Critical | Browser session model is undecided (ADR-0004, OQ-015). Wrong choice enlarges XSS/CSRF impact on financial data. | Open |
| F-02 | Critical | Accounting policies that change ledger and report design are undecided: profit basis (OQ-001), FX (OQ-006), entry numbering (OQ-026), rounding remainders (OQ-027). | Open |
| F-03 | High | Support/staff access to tenant data undecided (OQ-014). | Open |
| F-04 | High | Cross-tenant safety and service-role controls exist only on paper. Audit added: API Worker must not hold the service role key; jobs in a separate Worker. | Fixed in docs; pending implementation |
| F-05 | High | Privileged database roles can bypass immutability triggers; audit-chain external anchoring undecided (OQ-021). | Open |
| F-06 | High | AI-agent and test protections depend on repository settings not yet configured; `AGENTS.md` alone is not a control. | Pending implementation |
| F-07 | High | RPO/RTO not approved (OQ-016); no restore drill; per-tenant restore procedure missing. | Open |
| F-08 | High | Database access path from Workers undecided (ADR-0003, OQ-022); atomic posting depends on it. | Open |
| F-09 | Medium | OWASP/ASVS editions not verified; no control-to-test mapping. | Open |
| F-10 | Medium | Cloudflare/Supabase limits (CPU, pooling, regions, PITR, key handling) unverified against current documentation. | Open |
| F-11 | Medium | Legal and compliance undecided: jurisdictions, GDPR erasure vs retention, residency (OQ-011/012/013). Becomes High before launch in the EU. | Open |
| F-12 | Medium | Attachment malware scanning approach undecided (OQ-017). | Open |
| F-13 | Medium | MFA scope and separation-of-duties thresholds undecided (OQ-023). | Open |
| F-14 | Medium | CI/CD hardening was thin. Added branch protection incl. administrators, SHA-pinned actions, fork secrets, OIDC, SBOM. | Fixed in docs |
| F-15 | Medium | Docs did not assume a user may call the database HTTP API directly with their own JWT. Added rule 4a. | Fixed in docs |
| F-16 | Medium | Idempotency key scoping unspecified (cross-tenant replay risk). Now scoped by organization, user, route and body hash. | Fixed in docs |
| F-17 | Low | BR-012 and BR-019 had no tests. Added FT-34, FT-35. | Fixed in docs |
| F-18 | Low | Cosmetic defects: duplicate section numbers, duplicate related-link, reference to a non-existent folder. | Fixed in docs |
| F-19 | Low | Competitor research limited to public marketing pages; some pricing data dated or conflicting. | Open |
| F-20 | Medium | Independent penetration test not scheduled (OQ-025). | Open |

Counts: Critical 2, High 6, Medium 9, Low 3 = 20 findings; 7 fixed in documentation (unverified in code), 13 open or pending.

## 5. What would change these results
Implementation of the isolation and ledger test suites passing in CI; configured branch protection; a human security review; a restore drill; decisions on the Critical items; an external penetration test.
