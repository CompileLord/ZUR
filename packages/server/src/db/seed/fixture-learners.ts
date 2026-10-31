import crypto from 'node:crypto';
import type { DatabaseSync } from 'node:sqlite';

export function seedLearnersAndToken(
  db: DatabaseSync,
  now: string,
  { course1Id, ver1Id, ver2Id, step1Id, step4Id }: {
    course1Id: string; ver1Id: string; ver2Id: string; step1Id: string; step4Id: string;
  },
): void {
    // 6. Enrollments (design §17 fixtures)
    // Grace Hopper: pinned to old Version 1
    db.prepare(`
      INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at)
      VALUES ('enr-grace', 'user-student-2', ?, ?, 'active', '${now}', '${now}')
    `).run(course1Id, ver1Id);

    // Ada Lovelace: pinned to current Version 2
    db.prepare(`
      INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at)
      VALUES ('enr-ada', 'user-student-1', ?, ?, 'active', '${now}', '${now}')
    `).run(course1Id, ver2Id);

    // Alan Turing: pinned to current Version 2 with waived step
    db.prepare(`
      INSERT INTO enrollments (id, user_id, course_id, pinned_version_id, status, created_at, updated_at)
      VALUES ('enr-alan', 'user-student-3', ?, ?, 'active', '${now}', '${now}')
    `).run(course1Id, ver2Id);

    // 7. Step Progress & Waiver (design §17 fixture)
    // Ada completed step 1
    db.prepare(`
      INSERT INTO step_progress (id, user_id, enrollment_id, step_id, is_completed, completed_at, is_waived, created_at, updated_at)
      VALUES ('prog-ada-1', 'user-student-1', 'enr-ada', ?, 1, '${now}', 0, '${now}', '${now}')
    `).run(step1Id);

    // Alan Turing has waived step 4 (Python echo exercise)
    db.prepare(`
      INSERT INTO step_progress (id, user_id, enrollment_id, step_id, is_completed, is_waived, waiver_reason, waived_by_id, created_at, updated_at)
      VALUES ('prog-alan-waived', 'user-student-3', 'enr-alan', ?, 0, 1, 'Exercise test case issue under review', 'user-admin-1', '${now}', '${now}')
    `).run(step4Id);

    // 8. Saved Code Draft for Ada (design §17 fixture)
    db.prepare(`
      INSERT INTO code_drafts (id, user_id, enrollment_id, step_id, code, revision, updated_at)
      VALUES ('draft-ada-4', 'user-student-1', 'enr-ada', ?, 'import sys\nval = int(sys.stdin.read().strip())\nprint(val * 2)\n', 1, '${now}')
    `).run(step4Id);

    // 9. Author Access Token for Guido (design §17 fixture)
    const tokenSecret = 'zur_sec_sample_author_mcp_token_256bit_entropy';
    const tokenHash = crypto.createHash('sha256').update(tokenSecret).digest('hex');
    db.prepare(`
      INSERT INTO author_access_tokens (
        id, author_id, token_identifier, token_hash, label, scopes, course_restrictions, expires_at, is_revoked, created_at
      ) VALUES (
        'tok-guido-1', 'user-author-1', 'zat_guido_active', ?, 'My course-writing agent',
        '["courses:read","courses:create","content:write","media:write","exercises:validate"]',
        NULL, datetime('now', '+30 days'), 0, '${now}'
      )
    `).run(tokenHash);
}
