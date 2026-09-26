# POLICY-001: Data Retention, Ownership, Export, and Deletion Policy

- **Status**: Implementation in progress; external registry durability and staging restore require approval
- **Effective Date**: 2026-09-24
- **Version**: 1.0
- **Policy Owners**: Data Protection Officer / Privacy Reviewer, Engineering Lead
- **Relevant Specifications**: PRD_V2.md §§ 6, 7, 15, 17, 22; AC-20; tasks.json T004

---

## 1. Scope and Principles

This policy governs the retention, export, deletion, and ownership transfer of all personal, learning, and authoring data in ZUR. It establishes explicit schedules and operational procedures to ensure privacy compliance, prevent data resurrection upon database restores (AC-20), and protect learning records.

---

## 2. Retention Schedules

| Data Category | Authoritative Store | Retention Period | Deletion / Purge Method |
|---|---|---|---|
| **User Identity & Account** | `users`, `sessions` | Active life of account + 30 days post-verified deletion request | Cryptographic scrub of email, name, password hash; user status set to `purged` |
| **Operational Run Payloads (Custom Run & Sample Run)** | `execution_jobs` (run_samples / run_custom) | Maximum 24 hours | Automated daily cleanup cron |
| **Assessment Attempts (Submit Solution)** | `assessment_attempts` | Retained as long as student enrollment is retained; minimum duration of course | Hard delete only when enrollment record is permanently purged |
| **Student Code Drafts** | `code_drafts` | Scoped to active enrollment; cleared when enrollment is purged | Hard delete on enrollment purge |
| **Published Courses & Course Versions** | `courses`, `course_versions` | Immutable forever while active enrollments exist | Never deleted if enrolled students depend on it; marked `archived` |
| **Unpublished Course Drafts (Never Published)** | `courses` (draft) | Retained until explicit author deletion | Hard delete with child nodes and draft assets |
| **Media Assets (Images)** | Object storage / `media_assets` | Retained while referenced by any active draft or published version | Quarantine on detachment; purged 30 days after zero reference count |
| **Invitations & Tokens** | `invitations`, `author_access_tokens` | Email invites: 7 days expiry; Shareable links: max 30 days; MCP tokens: max 90 days | Expired/revoked records retained for audit 90 days, then purged |
| **Infrastructure & Application Logs** | Log files / audit stores | 30 days maximum retention; zero student code or secret payloads in general logs | Rolling 30-day rotation; daily deletion |
| **Client-side Local Storage / Caches** | Browser LocalStorage / IndexedDB | Active session only; account-scoped | **Strictly cleared upon user sign-out** (design §14, PRD §12.3) |

---

## 3. Account Deletion and Backup Re-Deletion Procedure (AC-20)

### 3.1 Account Deletion Workflow
1. User requests deletion via `/settings/privacy` (P20).
2. Consequence dialog details immediate cessation of access and 30-day grace period for support intervention.
3. If the user is the **sole owner of any published or active course**, deletion is blocked (see Section 4).
4. After confirmation:
   - User account status becomes `pending_deletion`.
   - All active sessions and author tokens are instantly revoked.
   - All email invitations sent to this address become invalid.
   - After verification window, personal data is permanently scrubbed: `display_name = 'Deleted Learner'`, `email = 'deleted-uuid@purged.invalid'`, `password_hash = ''`.
   - A deletion tombstone is flushed to the external `DELETION_REGISTRY_PATH` before the database purge transaction. The same metadata is copied to `deletion_registry` for operational lookup. If the database transaction fails, the external tombstone still prevents the account from being reactivated on restore; support must complete the purge before restoring service.

### 3.2 Restore Re-Deletion Handling (AC-20 Compliance)
- **Problem**: When a database backup from $T - \Delta$ is restored during disaster recovery, users who were deleted between $T - \Delta$ and $T$ could be resurrected in active state.
- **Solution**:
  1. Configure `DELETION_REGISTRY_PATH` as an absolute file path on independent, durable, append-only storage. Its history must survive database backup restoration. Provision an empty file before first startup; preserve file integrity and access controls. This storage has not yet been selected or exercised in staging.
  2. Production startup reads this file and reapplies tombstones before listening. The database restore verification runbook also mandates:
     ```bash
     npm run db:reapply-deletions
     ```
  3. This script scans the external registry and immediately scrubs and deactivates any restored records matching registered deleted identities **before public traffic is accepted**. Missing or malformed registry data aborts startup and restore. A local test covers a backup created before its tombstone; a staging restore remains required.

---

## 4. Course Ownership and Sole-Owner Transfer/Archive Procedure

1. **Sole-Owner Constraint**: A course owner cannot delete their account or abandon an active course while students are enrolled.
2. **Procedure for Course Ownership Transfer**:
   - Course author initiates a transfer request via `/teach/:courseId/settings` (P31).
   - Author enters the verified email of the target user who must have Author capability.
   - Platform support operator reviews and approves the transfer via `/admin/courses/:courseId` (P34), generating an audited event (`audit_events`).
3. **Procedure for Sole-Owner Course Archival**:
   - If no transfer recipient exists, owner archives the course (`archive_course`).
   - Active enrollments retain read-only and submission access on their pinned version.
   - New enrollments are blocked.
   - Once all active enrollments reach completion or 365 days of dormancy, the course structure is sealed into long-term cold archive.

---

## 5. Data Export Procedure

- User triggers `Request data export` via `/settings/privacy` (P20).
- System packages:
  - Account profile metadata (display name, creation date, email).
  - All submitted assessment attempts and code snapshots across all enrollments.
  - Course completion records and timestamps.
- Export file format: Standard JSON bundle + ZIP archive.
- Ready exports are available via authorized, short-lived download URLs (expiring in 24 hours).
- Download access is restricted to the authenticated requesting user.

---

## 6. Client-Side Cache Clearance on Sign-out

- Upon user sign-out (`/sign-in` transition):
  - In-memory unsaved changes are either synchronized or explicitly discarded per user prompt (design §14).
  - Local browser storage keys prefixed with `zur_account_*` and cached editor code snapshots are completely removed.
  - Prevents subsequent shared-computer users from accessing prior student code drafts.
