import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execSync } from 'node:child_process';
import { closeDatabase, getDatabase } from '../packages/server/src/db/database.ts';
import { runMigrations } from '../packages/server/src/db/migrate.ts';
import { seedDatabase } from '../packages/server/src/db/seed.ts';
import { TeacherRosterService } from '../packages/server/src/services/teacher-roster-service.ts';
import { InvitationService } from '../packages/server/src/services/invitation-service.ts';
import { renderStudentsAndInvitationsPage } from '../packages/web/src/pages/author/StudentsAndInvitationsPage.ts';
import { renderStudentDetailPage } from '../packages/web/src/pages/author/StudentDetailPage.ts';
import { renderCourseAnalyticsPage } from '../packages/web/src/pages/author/CourseAnalyticsPage.ts';

const rootDir = process.cwd();
const dbPath = path.join(os.tmpdir(), `zur-s4-m02-${process.pid}.sqlite`);

runMigrations(dbPath);
seedDatabase(dbPath);
const db = getDatabase(dbPath);

const authorId = 'user-author-1';
const courseId = 'course-python-foundations';

const rosterService = new TeacherRosterService(db);
const invitationService = new InvitationService(db);

// Generate sample invitations for realism
try {
  invitationService.createInvitation(authorId, courseId, {
    type: 'email',
    recipientEmail: 'katherine.johnson@zur.internal',
    expiresInDays: 7,
  });
  invitationService.createInvitation(authorId, courseId, {
    type: 'shareable_link',
    expiresInDays: 14,
    maxUses: 30,
  });
} catch {
  // Ignore if duplicate
}

// Add sample assessment attempts for Ada
const enrAda = db.prepare(`SELECT id, pinned_version_id FROM enrollments WHERE user_id = 'user-student-1' AND course_id = ?`).get(courseId) as any;
if (enrAda) {
  db.prepare(`
    INSERT OR IGNORE INTO assessment_attempts
      (id, user_id, enrollment_id, step_id, course_version_id, attempt_number, type, verdict, code_snapshot, is_infrastructure_failure, created_at)
    VALUES
      ('att-ada-p29-1', 'user-student-1', ?, 'step-4-python-echo', ?, 1, 'python', 'WRONG_ANSWER', 'val = input()\nprint(val)\n', 0, datetime('now', '-2 days')),
      ('att-ada-p29-2', 'user-student-1', ?, 'step-4-python-echo', ?, 2, 'python', 'PASSED', 'import sys\nval = int(sys.stdin.read().strip())\nprint(val * 2)\n', 0, datetime('now', '-1 day'))
  `).run(enrAda.id, enrAda.pinned_version_id, enrAda.id, enrAda.pinned_version_id);
}

// Gather rendered data
const rosterData = rosterService.listRoster(authorId, courseId);
const invitationsData = invitationService.listInvitations(authorId, courseId);
const studentDetailData = rosterService.getStudentDetail(authorId, courseId, enrAda.id);
const analyticsData = rosterService.getCourseMetrics(authorId, courseId, { timeWindowDays: 7 });

// Read CSS files
const stylesDir = path.join(rootDir, 'packages/web/src/styles');
const cssTokens = fs.readFileSync(path.join(stylesDir, 'tokens.css'), 'utf-8');
const cssTypography = fs.readFileSync(path.join(stylesDir, 'typography.css'), 'utf-8');
const cssLayout = fs.readFileSync(path.join(stylesDir, 'layout.css'), 'utf-8');
const cssShells = fs.readFileSync(path.join(stylesDir, 'shells.css'), 'utf-8');
const cssComponents = fs.readFileSync(path.join(stylesDir, 'components.css'), 'utf-8');

const combinedCss = `
  ${cssTokens}
  ${cssTypography}
  ${cssLayout}
  ${cssShells}
  ${cssComponents}
  body {
    background-color: var(--bg-canvas, #141613);
    color: var(--text-primary, #F1F3EA);
    margin: 0;
    padding: 0;
    font-family: Inter, ui-sans-serif, system-ui, sans-serif;
  }
`;

function buildFullHtml(title: string, bodyContent: string): string {
  return `<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${title} — ZUR</title>
  <style>
    ${combinedCss}
  </style>
</head>
<body>
  <div id="app">
    ${bodyContent}
  </div>
</body>
</html>`;
}

const screenshotsDir = path.join(rootDir, 'screenshots');
if (!fs.existsSync(screenshotsDir)) {
  fs.mkdirSync(screenshotsDir, { recursive: true });
}

// 1. P28 Roster Page
const p28Html = renderStudentsAndInvitationsPage({
  courseId,
  courseTitle: 'Python foundations',
  publicationState: 'published',
  hasUnpublishedChanges: false,
  totalStudentsCount: rosterData.total,
  roster: rosterData as any,
  invitations: invitationsData as any,
  currentTab: 'enrolled',
});
const p28FilePath = path.join('/tmp', 's4_m02_p28_roster.html');
fs.writeFileSync(p28FilePath, buildFullHtml('Students and Invitations - Roster', p28Html));

// 2. P28 Invitations Tab
const p28InvHtml = renderStudentsAndInvitationsPage({
  courseId,
  courseTitle: 'Python foundations',
  publicationState: 'published',
  hasUnpublishedChanges: false,
  totalStudentsCount: rosterData.total,
  roster: rosterData as any,
  invitations: invitationsData as any,
  currentTab: 'invitations',
});
const p28InvFilePath = path.join('/tmp', 's4_m02_p28_invitations.html');
fs.writeFileSync(p28InvFilePath, buildFullHtml('Students and Invitations - Invitations', p28InvHtml));

// 3. P29 Student Detail Page
const p29Html = renderStudentDetailPage({
  courseId,
  courseTitle: 'Python foundations',
  publicationState: 'published',
  hasUnpublishedChanges: false,
  data: studentDetailData as any,
  selectedStepId: 'step-4-python-echo',
});
const p29FilePath = path.join('/tmp', 's4_m02_p29_student_detail.html');
fs.writeFileSync(p29FilePath, buildFullHtml('Student Detail - Ada Lovelace', p29Html));

// 4. P30 Course Analytics Page
const p30Html = renderCourseAnalyticsPage({
  courseId,
  courseTitle: 'Python foundations',
  publicationState: 'published',
  hasUnpublishedChanges: false,
  analytics: analyticsData as any,
  availableVersions: analyticsData.versions,
  filters: { windowDays: 7 },
});
const p30FilePath = path.join('/tmp', 's4_m02_p30_analytics.html');
fs.writeFileSync(p30FilePath, buildFullHtml('Course Analytics', p30Html));

// Capture with Chrome Headless
const captures = [
  { html: p28FilePath, png: path.join(screenshotsDir, 's4_m02_p28_roster.png'), size: '1440,900' },
  { html: p28InvFilePath, png: path.join(screenshotsDir, 's4_m02_p28_invitations.png'), size: '1440,900' },
  { html: p29FilePath, png: path.join(screenshotsDir, 's4_m02_p29_student_detail.png'), size: '1440,900' },
  { html: p29FilePath, png: path.join(screenshotsDir, 's4_m02_p29_student_detail_tablet.png'), size: '768,1024' },
  { html: p30FilePath, png: path.join(screenshotsDir, 's4_m02_p30_analytics.png'), size: '1440,900' },
  { html: p30FilePath, png: path.join(screenshotsDir, 's4_m02_p30_analytics_tablet.png'), size: '768,1024' },
  { html: p30FilePath, png: path.join(screenshotsDir, 's4_m02_p30_analytics_mobile.png'), size: '390,844' },
];

for (const { html, png, size } of captures) {
  console.log(`Capturing ${png}...`);
  execSync(
    `google-chrome --headless --disable-gpu --no-sandbox --screenshot="${png}" --window-size=${size} --virtual-time-budget=2000 "file://${html}"`,
    { stdio: 'inherit' }
  );
}

console.log('All screenshots captured successfully.');
closeDatabase(dbPath);
for (const suffix of ['', '-wal', '-shm']) {
  const file = `${dbPath}${suffix}`;
  if (fs.existsSync(file)) fs.unlinkSync(file);
}
for (const html of [p28FilePath, p28InvFilePath, p29FilePath, p30FilePath]) {
  if (fs.existsSync(html)) fs.unlinkSync(html);
}
