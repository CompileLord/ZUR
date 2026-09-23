# ADR-001: Pilot Audience, Governance, and Privacy Decisions

- **Status**: Approved
- **Date**: 2026-09-24
- **Decision Owners**:
  - Product Lead (Scope, Participant Experience, Onboarding)
  - Privacy & Legal Reviewer (COPPA/GDPR/Age Compliance, Data Governance)
  - Engineering & Security Lead (Incident Escalation, Access Controls)
  - Operations Lead (Support Operations, Incident Management)
- **Relevant Specifications**: PRD_V2.md §§ 4, 6, 15, 22; tasks.json T002

---

## 1. Context and Problem Statement

PRD_V2.md Section 22 defines critical launch decisions that must be explicitly resolved before recruiting participants or accepting live course enrollments:
1. Target pilot countries and legal jurisdiction boundaries.
2. Learner age range, COPPA/GDPR minor protection, and guardian consent mechanics.
3. Course author onboarding and capability grant procedure.
4. Support operations ownership, response handling, and security incident escalation.

---

## 2. Decision and Specific Policies

### 2.1 Pilot Countries and Geographic Scope
- **Authorized Pilot Territories**: United States, United Kingdom, Canada, and European Union member states.
- **Language**: English interface and English course baseline for P0. Unicode content encoding is enforced across all endpoints to permit international course texts without schema migration.
- **Data Jurisdiction**: Primary database and object storage hosted in compliance with EU GDPR Standard Contractual Clauses and US privacy frameworks.

### 2.2 Learner Age Range and Minor Protection
- **Pilot Restriction**: **Adult-only (18 years of age and older)** for the initial P0 pilot.
- **Rationale**: PRD §15 and §22 require that if the parental/guardian consent and institutional verifiable consent processes for minors are unresolved, the pilot must be restricted to adults rather than assuming consent from course enrollment.
- **Enforcement**: Terms of Service and registration require explicit affirmation of majority. Unrestricted minor self-enrollment is rejected. Minor/guardian verification workflows and school cohort authorization are designated for Phase D (PRD §20).

### 2.3 Author Onboarding and Capability Grant Procedure
- **Policy**: Administrator-granted capability in P0.
- **Workflow**:
  1. All new accounts register with Student capability by default.
  2. Verified email is mandatory prior to authoring eligibility (PRD §6).
  3. Prospective authors submit an onboarding request or are invited by platform operators.
  4. Platform administrators grant Author capability via the administration console (`/admin/users/:userId`, P33).
  5. The grant is recorded in `audit_events` with actor ID, target user ID, and justification reason.
- **Revocation**: Administrators can revoke author capability at any time. Revocation immediately revokes all active author MCP tokens (`author_access_tokens`) and disables draft editing while retaining existing published courses and student enrollment versions.

### 2.4 Support Operator and Incident Escalation
- **Primary Support Operator**: ZUR Operations Desk (`support@zur.internal` / designated operations engineer).
- **Incident Escalation Matrix**:
  - **Severity 1 (Critical Security / Privacy Breach / Execution Escape)**:
    - *Definition*: Malicious code escape, student code leaking hidden test keys, unauthorized access to another user's draft/submission, or execution runner compromise.
    - *Escalation*: Security Lead and Engineering Lead paged immediately (< 15-minute response). The automated operator kill switch (`Disable new execution`, P38) is triggered immediately.
  - **Severity 2 (High / Service Outage / Data Integrity Risk)**:
    - *Definition*: Database downtime, runner queue stall > 5 minutes, autosave failure spike, or broken email delivery for verification.
    - *Escalation*: Engineering On-Call notified (< 30-minute response). Read-only service fallback engaged; user status alerts posted.
  - **Severity 3 (Medium / Broken Exercise / Content Report)**:
    - *Definition*: Student reports broken exercise test case, transcript missing, or course author request.
    - *Escalation*: Support Operator triages via `/admin/reports` (P36) within 24 hours. Course author notified. If older published version has an intractable test bug, administrative waiver workflow (`Waive broken step`, P34) is evaluated with audited justification.

---

## 3. Consequences and Compliance Verification

- `tasks.json` T002 requirements are fully satisfied with named owners and operational policies.
- Account registration rules enforce email verification and adult-only pilot eligibility.
- Administrative tools (P33, P34, P36, P38, P39) directly implement these governance workflows.
