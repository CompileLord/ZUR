import type { DatabaseSync } from 'node:sqlite';
import { NotFoundError, AuthorizationError, type TestCase } from 'zur-shared';

export function getPinnedAssessment(db: DatabaseSync, userId: string, enrollmentId: string | null | undefined, stepId: string): { versionId: string; testCases: TestCase[] } {
  if (!enrollmentId) throw new NotFoundError("This page isn't available.");
  const enrollment = db.prepare(`
    SELECT e.user_id, e.status, e.pinned_version_id, c.is_suspended
    FROM enrollments e JOIN courses c ON c.id = e.course_id WHERE e.id = ?
  `).get(enrollmentId) as any;
  if (!enrollment || enrollment.user_id !== userId || enrollment.status !== 'active') {
    throw new NotFoundError("This page isn't available.");
  }
  if (enrollment.is_suspended) throw new AuthorizationError('Course access is suspended.');
  const version = db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get(enrollment.pinned_version_id) as any;
  if (!version) throw new NotFoundError("This page isn't available.");
  let snapshot: any;
  try { snapshot = JSON.parse(version.snapshot_data); }
  catch { throw new NotFoundError("This page isn't available."); }
  const step = (snapshot.modules || []).flatMap((module: any) => module.lessons || [])
    .flatMap((lesson: any) => lesson.steps || []).find((item: any) => item.id === stepId);
  if (!step || step.type !== 'python' || !Array.isArray(step.content?.testCases)) throw new NotFoundError("This page isn't available.");
  const testCases = step.content.testCases.map((test: any) => ({
    id: String(test.id),
    stepId,
    stdin: String(test.stdin ?? ''),
    expectedStdout: String(test.expectedStdout ?? ''),
    isHidden: Boolean(test.isHidden),
    position: Number(test.position),
    createdAt: String(test.createdAt ?? ''),
  })) as TestCase[];
  if (testCases.length === 0) throw new NotFoundError("This page isn't available.");
  return { versionId: enrollment.pinned_version_id, testCases };
}

function readSnapshotTestCases(db: DatabaseSync, versionId: string, stepId: string): TestCase[] | null {
  const version = db.prepare('SELECT snapshot_data FROM course_versions WHERE id = ?').get(versionId) as any;
  if (!version?.snapshot_data) return null;
  try {
    const snapshot = JSON.parse(version.snapshot_data);
    const step = (snapshot.modules || []).flatMap((module: any) => module.lessons || [])
      .flatMap((lesson: any) => lesson.steps || []).find((item: any) => item.id === stepId);
    if (!step || step.type !== 'python' || !Array.isArray(step.content?.testCases)) return null;
    return step.content.testCases.map((test: any) => ({
      id: String(test.id), stepId, stdin: String(test.stdin ?? ''), expectedStdout: String(test.expectedStdout ?? ''),
      isHidden: Boolean(test.isHidden), position: Number(test.position), createdAt: String(test.createdAt ?? ''),
    }));
  } catch { return null; }
}

export function getTestCasesForJob(db: DatabaseSync, candidate: any): TestCase[] {
  let testCases: TestCase[] | null = null;
  if (candidate.assessment_snapshot) {
    try { testCases = JSON.parse(candidate.assessment_snapshot) as TestCase[]; }
    catch { throw new NotFoundError('Execution assessment snapshot is unavailable.'); }
  }
  let versionId = candidate.course_version_id as string | null;
  if (!versionId && candidate.enrollment_id) {
    versionId = (db.prepare('SELECT pinned_version_id FROM enrollments WHERE id = ?').get(candidate.enrollment_id) as any)?.pinned_version_id || null;
  }
  if (!testCases && versionId) testCases = readSnapshotTestCases(db, versionId, candidate.step_id);
  if (testCases) return testCases;
  const rows = db.prepare(`
    SELECT id, step_id, stdin, expected_stdout, is_hidden, position, created_at
    FROM test_cases WHERE step_id = ? ORDER BY position ASC
  `).all(candidate.step_id) as any[];
  return rows.map((tc) => ({
    id: tc.id, stepId: tc.step_id, stdin: tc.stdin, expectedStdout: tc.expected_stdout,
    isHidden: Boolean(tc.is_hidden), position: tc.position, createdAt: tc.created_at,
  }));
}
