import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAdminPage } from '../src/pages/admin/AdminPages.ts';
import { renderPrivacySettingsPage } from '../src/pages/settings/PrivacySettingsPage.ts';

test('admin operations screens render real empty and unavailable states safely',()=>{
  const overview=renderAdminPage('/admin',{refreshedAt:'now',execution:{paused:false},queue:{queued:0,running:0,oldestQueuedAt:null},workers:{health:'Unavailable',lastObservedAt:null},internalErrors:0,openReports:0,emailDeliveryIssues:0,telemetry:{queue:'available',workerHeartbeat:'unavailable',email:'available'}});
  assert.match(overview,/Runner telemetry/);assert.match(overview,/Unavailable/);assert.match(overview,/No queued jobs/);
  const media=renderAdminPage('/admin/media',{items:[{id:'asset-1',courseTitle:'Course',mimeType:'image/png',fileSize:1024,processingStatus:'quarantined',referenceCount:2}]});
  assert.match(media,/2/);assert.match(media,/restore/);assert.doesNotMatch(media,/Delete unreferenced asset/);
  const free=renderAdminPage('/admin/media',{items:[{id:'asset-2',courseTitle:'Course',mimeType:'image/png',fileSize:1024,processingStatus:'quarantined',referenceCount:0}]});
  assert.match(free,/Delete unreferenced asset/);
});

test('operations overview displays escaped real alert and marks request metrics volatile',()=>{
  const page=renderAdminPage('/admin',{refreshedAt:'today',execution:{paused:true},queue:{queued:0,running:0,oldestQueuedAt:null},workers:{health:'Unavailable',lastObservedAt:null},internalErrors:0,openReports:0,emailDeliveryIssues:0,telemetry:{queue:'available',workerHeartbeat:'not configured',email:'available'},operational:{alerts:[{severity:'critical',code:'execution.stale_running',message:'1 expired lease'}],requestMetrics:{retention:'In-memory; resets on restart',recentByFamily:{auth:{requests:4,failures:2,p95LatencyMs:40}}},execution:{},email:{}}});
  assert.match(page,/Operational alerts/);assert.match(page,/execution\.stale_running/);assert.match(page,/role="alert"/);
  assert.match(page,/reset on process restart/);assert.match(page,/p95 latency/);
});

test('admin pages escape user supplied content and preserve server rendered filters',()=>{
  const page=renderAdminPage('/admin/users?search=%3Cimg%20src=x%3E&status=suspended',{items:[{id:'u1',displayName:'<script>alert(1)</script>',email:'evil@example.test',emailVerified:false,capabilities:['student'],accountStatus:'suspended',createdAt:'today'}]});
  assert.doesNotMatch(page,/<script>alert/);assert.match(page,/&lt;script&gt;/);assert.match(page,/value="&lt;img src=x&gt;"/);assert.match(page,/value="suspended" selected/);
});

test('privacy request status exposes only the account owner download route before expiry',()=>{
  const page=renderPrivacySettingsPage({requests:[{id:'priv-1',userId:'u1',requestType:'export',status:'completed',consequenceAcknowledged:true,createdAt:'2026-09-20T00:00:00.000Z',updatedAt:'2026-09-20T00:00:00.000Z',exportExpiresAt:new Date(Date.now()+3600000).toISOString()}]});
  assert.match(page,/api\/settings\/privacy\/exports\/priv-1/);assert.match(page,/Download export/);assert.match(page,/class="modal-backdrop hidden"/);
});

test('operations overview renders internal-error rate with stated window and honest unavailable state (T077, P32)',()=>{
  // Case 1: insufficient telemetry (0 requests) -> Unavailable
  const pageUnavailable = renderAdminPage('/admin', {
    refreshedAt: 'now',
    execution: { paused: false },
    queue: { queued: 0, running: 0, oldestQueuedAt: null },
    workers: { health: 'Unavailable', lastObservedAt: null },
    internalErrorRate: {
      window: '5m',
      windowLabel: 'Last 5 minutes',
      windowSeconds: 300,
      numerator: 0,
      denominator: 0,
      rate: null,
      rateFormatted: 'Unavailable',
      status: 'insufficient_telemetry',
    },
    openReports: 0,
    emailDeliveryIssues: 0,
    telemetry: { queue: 'available', workerHeartbeat: 'not configured', email: 'no data', internalErrorRate: 'insufficient_telemetry' },
  });
  assert.match(pageUnavailable, /Internal-error rate/);
  assert.match(pageUnavailable, /Unavailable/);
  assert.match(pageUnavailable, /Insufficient telemetry \(0 requests in Last 5 minutes · resets on restart\)/);

  // Case 2: real telemetry with calculated rate
  const pageAvailable = renderAdminPage('/admin', {
    refreshedAt: 'now',
    execution: { paused: false },
    queue: { queued: 0, running: 0, oldestQueuedAt: null },
    workers: { health: 'Unavailable', lastObservedAt: null },
    internalErrorRate: {
      window: '5m',
      windowLabel: 'Last 5 minutes',
      windowSeconds: 300,
      numerator: 2,
      denominator: 200,
      rate: 0.01,
      rateFormatted: '1.00%',
      status: 'available',
    },
    openReports: 0,
    emailDeliveryIssues: 0,
    telemetry: { queue: 'available', workerHeartbeat: 'not configured', email: 'recent success', internalErrorRate: 'available' },
  });
  assert.match(pageAvailable, /Internal-error rate/);
  assert.match(pageAvailable, /1\.00%/);
  assert.match(pageAvailable, /2 5xx errors \/ 200 requests · Last 5 minutes/);

  // Case 3: singular request and singular 5xx error grammar
  const pageSingular = renderAdminPage('/admin', {
    refreshedAt: 'now',
    execution: { paused: false },
    queue: { queued: 0, running: 0, oldestQueuedAt: null },
    workers: { health: 'Unavailable', lastObservedAt: null },
    internalErrorRate: {
      window: '5m',
      windowLabel: 'Last 5 minutes',
      windowSeconds: 300,
      numerator: 1,
      denominator: 1,
      rate: 1.0,
      rateFormatted: '100.00%',
      status: 'available',
    },
    openReports: 0,
    emailDeliveryIssues: 0,
    telemetry: { queue: 'available', workerHeartbeat: 'not configured', email: 'recent success', internalErrorRate: 'available' },
  });
  assert.match(pageSingular, /1 5xx error \/ 1 request · Last 5 minutes/);

  const pageSingularUnavailable = renderAdminPage('/admin', {
    refreshedAt: 'now',
    execution: { paused: false },
    queue: { queued: 0, running: 0, oldestQueuedAt: null },
    workers: { health: 'Unavailable', lastObservedAt: null },
    internalErrorRate: {
      window: '5m',
      windowLabel: 'Last 5 minutes',
      windowSeconds: 300,
      numerator: 0,
      denominator: 1,
      rate: null,
      rateFormatted: 'Unavailable',
      status: 'insufficient_telemetry',
    },
    openReports: 0,
    emailDeliveryIssues: 0,
    telemetry: { queue: 'available', workerHeartbeat: 'not configured', email: 'no data', internalErrorRate: 'insufficient_telemetry' },
  });
  assert.match(pageSingularUnavailable, /Insufficient telemetry \(1 request in Last 5 minutes · resets on restart\)/);
});

test('internal-error rate card links to recent request metrics anchor and avoids misleading execution link (T077, P32)',()=>{
  // When operational telemetry is present, card links to the anchor on the same page
  const pageWithOps = renderAdminPage('/admin', {
    refreshedAt: 'now',
    execution: { paused: false },
    queue: { queued: 0, running: 0, oldestQueuedAt: null },
    workers: { health: 'Unavailable', lastObservedAt: null },
    internalErrorRate: {
      window: '5m',
      windowLabel: 'Last 5 minutes',
      windowSeconds: 300,
      numerator: 0,
      denominator: 10,
      rate: 0.0,
      rateFormatted: '0.00%',
      status: 'available',
    },
    openReports: 0,
    emailDeliveryIssues: 0,
    telemetry: { queue: 'available', workerHeartbeat: 'not configured', email: 'recent success', internalErrorRate: 'available' },
    operational: {
      alerts: [],
      requestMetrics: { retention: 'In-memory', recentByFamily: {} },
    },
  });
  assert.match(pageWithOps, /id="recent-request-metrics"/);
  assert.match(pageWithOps, /<a href="#recent-request-metrics">Recent request metrics<\/a>/);
  assert.doesNotMatch(pageWithOps, /<h2>Internal-error rate<\/h2>[\s\S]*?href="\/admin\/execution">Execution records<\/a>/);

  // When operational telemetry is not present, card renders no broken anchor
  const pageWithoutOps = renderAdminPage('/admin', {
    refreshedAt: 'now',
    execution: { paused: false },
    queue: { queued: 0, running: 0, oldestQueuedAt: null },
    workers: { health: 'Unavailable', lastObservedAt: null },
    internalErrorRate: {
      window: '5m',
      windowLabel: 'Last 5 minutes',
      windowSeconds: 300,
      numerator: 0,
      denominator: 0,
      rate: null,
      rateFormatted: 'Unavailable',
      status: 'insufficient_telemetry',
    },
    openReports: 0,
    emailDeliveryIssues: 0,
    telemetry: { queue: 'available', workerHeartbeat: 'not configured', email: 'no data', internalErrorRate: 'insufficient_telemetry' },
  });
  assert.doesNotMatch(pageWithoutOps, /href="#recent-request-metrics"/);
  assert.doesNotMatch(pageWithoutOps, /href="\/admin\/execution">Execution records<\/a>/);
});

test('report detail links to exact immutable course version and step, never assuming newest (T081, P36)',()=>{
  // Case 1: Report with exact immutable version and step
  const pageWithVersion = renderAdminPage('/admin/reports/rep-1', {
    id: 'rep-1',
    type: 'broken_exercise',
    status: 'open',
    description: 'Code execution fails unexpectedly',
    courseId: 'course-py',
    courseTitle: 'Python Foundations',
    courseVersionId: 'ver-historical-1',
    versionNumber: 1,
    stepId: 'step-echo-1',
    stepTitle: 'Print Stdin',
    versionDetails: { id: 'ver-historical-1', versionNumber: 1, createdAt: '2026-09-01T00:00:00Z', isLatest: false },
  });

  assert.match(pageWithVersion, /Reported learning context/);
  assert.match(pageWithVersion, /href="\/admin\/courses\/course-py\?versionId=ver-historical-1&amp;stepId=step-echo-1"/);
  assert.match(pageWithVersion, /Version 1 \(historical version, not newest\)/);
  assert.match(pageWithVersion, /Print Stdin/);

  // Case 2: Report without version (safe unavailable state)
  const pageWithoutVersion = renderAdminPage('/admin/reports/rep-2', {
    id: 'rep-2',
    type: 'inappropriate_content',
    status: 'open',
    description: 'General course feedback',
    courseId: 'course-py',
    courseTitle: 'Python Foundations',
    courseVersionId: null,
    stepId: null,
  });
  assert.match(pageWithoutVersion, /Unavailable — no version snapshot recorded/);
  assert.match(pageWithoutVersion, /Course-level report/);

  // Case 2b: Report with courseVersionId but missing snapshot (versionDetails is null)
  // Must render safe unavailable state and NEVER produce a misleading clickable link
  const pageWithMissingSnapshot = renderAdminPage('/admin/reports/rep-2b', {
    id: 'rep-2b',
    type: 'broken_exercise',
    status: 'open',
    description: 'Report pointing to deleted or corrupted snapshot',
    courseId: 'course-py',
    courseTitle: 'Python Foundations',
    courseVersionId: 'ver-missing-snapshot',
    versionNumber: null,
    stepId: 'step-echo-1',
    stepTitle: null,
    versionDetails: null,
  });
  assert.match(pageWithMissingSnapshot, /Unavailable — no version snapshot recorded/);
  assert.doesNotMatch(pageWithMissingSnapshot, /data-report-version-link/);
  assert.doesNotMatch(pageWithMissingSnapshot, /data-report-step-link/);
  assert.doesNotMatch(pageWithMissingSnapshot, /href="\/admin\/courses\/course-py\?versionId=/);

  // Case 3: Course detail inspects exact reported version when opened with query params
  const coursePage = renderAdminPage('/admin/courses/course-py?versionId=ver-historical-1&stepId=step-echo-1', {
    id: 'course-py',
    title: 'Python Foundations',
    ownerName: 'Ada',
    ownerEmail: 'ada@example.test',
    latestVersion: 2,
    activeEnrollments: 5,
    openReports: 1,
    isSuspended: false,
    versions: [
      {
        id: 'ver-historical-1',
        versionNumber: 1,
        createdAt: '2026-09-01',
        steps: [{ id: 'step-echo-1', title: 'Print Stdin', isRequired: true }],
      },
      {
        id: 'ver-current-2',
        versionNumber: 2,
        createdAt: '2026-09-15',
        steps: [{ id: 'step-echo-1', title: 'Print Stdin', isRequired: true }],
      },
    ],
  });
  assert.match(coursePage, /Version 1 · Historical · Print Stdin/);
  assert.match(coursePage, /Target step snapshot: Print Stdin/);
  assert.match(coursePage, /Technical snapshot details/);
  // Dropdown should have selected option for historical version
  assert.match(coursePage, /value="ver-historical-1\|step-echo-1" selected/);
});
