import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import crypto from 'node:crypto';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../packages/server/src/db/seed.ts';
import { AdminService } from '../packages/server/src/services/admin-service.ts';
import { OperationalMetricsService } from '../packages/server/src/services/operational-metrics-service.ts';
import { renderAdminPage } from '../packages/web/src/pages/admin/AdminPages.ts';
import { renderPythonWorkspacePage } from '../packages/web/src/pages/learning/PythonWorkspacePage.ts';
import type { ExecutionResult } from '../packages/shared/src/types/index.ts';

const root = process.cwd();
const dbPath = `file:s4m04-${crypto.randomUUID()}?mode=memory&cache=shared`;
const db = (runMigrations(dbPath), seedDatabase(dbPath), getDatabase(dbPath));
const out = path.join(root, 'screenshots');
const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'zur-s4m04-'));
const styles = ['tokens.css', 'typography.css', 'layout.css', 'shells.css', 'components.css']
  .map((file) => fs.readFileSync(path.join(root, 'packages/web/src/styles', file), 'utf8')).join('\n');
const admin = new AdminService(db);
const metrics = new OperationalMetricsService();
const now = Date.now();
metrics.recordRequest('PUT', '/api/drafts', 503, 125, now - 1000);
metrics.recordRequest('POST', '/api/auth/sign-in', 401, 38, now - 700);
const overview = {
  ...admin.getOperationsOverview('user-admin-1'),
  operational: metrics.snapshot(db, now),
};
const enrollment = db.prepare("SELECT id FROM enrollments WHERE user_id='user-student-1' LIMIT 1").get() as any;
const step = db.prepare('SELECT id FROM steps LIMIT 1').get() as any;
db.prepare(`INSERT INTO execution_jobs(id,user_id,enrollment_id,step_id,job_type,code,status,lease_expires_at,created_at,updated_at)
  VALUES('fixture-stale-running','user-student-1',?,?,'submit','print(1)','running',?,?,?)`).run(enrollment.id, step.id, new Date(now - 1000).toISOString(), new Date(now - 60_000).toISOString(), new Date(now - 60_000).toISOString());
db.prepare(`INSERT INTO execution_jobs(id,user_id,enrollment_id,step_id,job_type,code,status,created_at,updated_at)
  VALUES('fixture-old-queued','user-student-1',?,?,'submit','print(1)','queued',?,?)`).run(enrollment.id, step.id, new Date(now - 60_000).toISOString(), new Date(now - 60_000).toISOString());
for (let i = 0; i < 2; i++) metrics.recordRequest('PUT', '/api/drafts', 503, 140, now - 500);
for (let i = 0; i < 19; i++) metrics.recordRequest('POST', '/api/auth/sign-in', 401, 36, now - 400);
const alertOverview = {
  ...admin.getOperationsOverview('user-admin-1'),
  operational: metrics.snapshot(db, now),
};
const result: ExecutionResult = {
  jobId: 'fixture-attempt', verdict: 'WRONG_ANSWER', isInfrastructureFailure: false,
  executionTimeMs: 14, completedAt: new Date().toISOString(),
  testResults: [{ position: 0, passed: false, verdict: 'WRONG_ANSWER', input: '4', expectedOutput: 'Even', actualOutput: 'Odd', isHidden: false, executionTimeMs: 14 }],
};
const workspace = renderPythonWorkspacePage({
  courseTitle: 'Python foundations', courseOverviewUrl: '/learn/enr-ada', lessonTitle: 'Conditions',
  stepTitle: 'Classify a number using its remainder', stepOrdinalText: 'Lesson 2 · Step 3 of 5',
  enrollmentId: 'enr-ada', stepId: 'step-6-python-evenodd',
  problemStatement: 'Read an integer and print Even when divisible by two; otherwise print Odd.',
  inputFormat: 'One integer on standard input.', outputFormat: 'Print one word.', constraints: '−10⁶ ≤ n ≤ 10⁶',
  starterCode: 'value = int(input())\n', currentCode: 'value = int(input())\nprint("Odd" if value % 2 else "Even")\n',
  examples: [{ input: '4', output: 'Even' }], hints: ['Use the remainder operator.'],
  saveStatus: 'unsaved', currentResult: result,
});
const hiddenFailureWorkspace = renderPythonWorkspacePage({
  courseTitle: 'Python foundations', courseOverviewUrl: '/learn/enr-ada', lessonTitle: 'Conditions',
  stepTitle: 'Classify a number using its remainder', stepOrdinalText: 'Lesson 2 · Step 3 of 5',
  enrollmentId: 'enr-ada', stepId: 'step-6-python-evenodd',
  problemStatement: 'Read an integer and print Even when divisible by two; otherwise print Odd.',
  inputFormat: 'One integer on standard input.', outputFormat: 'Print one word.', constraints: '−10⁶ ≤ n ≤ 10⁶',
  starterCode: 'value = int(input())\n', currentCode: 'value = int(input())\nprint(value % 2)\n',
  saveStatus: 'saved', currentResult: {
    jobId: 'fixture-hidden-attempt', verdict: 'WRONG_ANSWER', isInfrastructureFailure: false,
    executionTimeMs: 120, completedAt: new Date().toISOString(),
    guidance: 'Your solution did not pass a hidden test. Review the input limits and edge cases.',
    testResults: [],
  },
});

function html(title: string, body: string, theme: 'dark' | 'light' = 'dark') {
  return `<!doctype html><html lang="en" data-theme="${theme}"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${title}</title><style>${styles}body{margin:0;background:var(--bg-canvas);color:var(--text-primary);font-family:Inter,system-ui,sans-serif}</style></head><body><a href="#main-content" class="skip-to-content">Skip to content</a><div id="app">${body}</div></body></html>`;
}

function capture(name: string, content: string, width: number, height: number, scale = 1) {
  const source = path.join(tempDir, `${name}.html`);
  fs.writeFileSync(source, html(name, content, name.includes('light') ? 'light' : 'dark'));
  execFileSync('google-chrome', [
    '--headless', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--run-all-compositor-stages-before-draw',
    `--user-data-dir=${path.join(tempDir, `profile-${name}`)}`, `--force-device-scale-factor=${scale}`,
    `--screenshot=${path.join(out, `${name}.png`)}`, `--window-size=${width},${height}`, '--virtual-time-budget=1000', `file://${source}`,
  ], { stdio: 'ignore' });
}

try {
  fs.mkdirSync(out, { recursive: true });
  const adminPage = renderAdminPage('/admin', overview, undefined, { displayName: 'Margaret Hamilton', email: 'margaret@zur.internal' });
  const adminAlertPage = renderAdminPage('/admin', alertOverview, undefined, { displayName: 'Margaret Hamilton', email: 'margaret@zur.internal' });
  capture('s4_m04_operations_1440', adminPage, 1440, 900);
  capture('s4_m04_operations_alert_fixture_1440', adminAlertPage, 1440, 900);
  capture('s4_m04_operations_390', adminPage, 390, 844);
  capture('s4_m04_operations_320', adminPage, 320, 844);
  capture('s4_m04_python_unsaved_public_failure_1440', workspace, 1440, 900);
  capture('s4_m04_python_hidden_failure_1440', hiddenFailureWorkspace, 1440, 900);
  capture('s4_m04_python_guidance_1024', workspace, 1024, 768);
  capture('s4_m04_python_guidance_768', workspace, 768, 1024);
  capture('s4_m04_python_guidance_390', workspace, 390, 844);
  capture('s4_m04_python_guidance_320', workspace, 320, 844);
  capture('s4_m04_python_zoom200_640', workspace, 640, 900, 2);
  capture('s4_m04_python_light_390', workspace, 390, 844);
  console.log('Captured S4-M04 operational and Python workspace responsive/adverse fixtures.');
} finally {
  closeDatabase(dbPath);
  fs.rmSync(tempDir, { recursive: true, force: true });
}
