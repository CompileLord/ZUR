import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAdminPage } from '../src/pages/admin/AdminPages.ts';

function overviewData(over: Record<string, unknown> = {}) {
  return {
    refreshedAt: '2026-10-01T10:00:00.000Z',
    execution: { paused: false },
    queue: { queued: 0, running: 0, oldestQueuedAt: null },
    workers: { health: 'Unavailable', lastObservedAt: null },
    internalErrors: 0,
    openReports: 0,
    emailDeliveryIssues: 0,
    telemetry: { queue: 'available', workerHeartbeat: 'unavailable', email: 'available' },
    ...over,
  };
}

test('overview carries no worker-heartbeat placeholder, on the overview or the execution page', () => {
  const overview = renderAdminPage('/admin', overviewData());
  assert.doesNotMatch(overview, /Runner heartbeat/);
  assert.doesNotMatch(overview, /Not configured/);
  const execution = renderAdminPage('/admin/execution', { overview: overviewData(), jobs: { items: [], total: 0 } });
  assert.doesNotMatch(execution, /Worker health/);
});

test('overview alerts use human labels and drop the ones curated cards already show', () => {
  const alerts = [
    { severity: 'warning', code: 'autosave.recent_failures', message: '3 autosave/API request failure(s) were observed.' },
    { severity: 'warning', code: 'email.delivery_issues', message: '2 email invitation(s) have a delivery issue.' },
    { severity: 'warning', code: 'execution.infrastructure_failures', message: '6 infrastructure failures.' },
    { severity: 'warning', code: 'auth.authorization_denials', message: 'Elevated denials.' },
  ];
  const html = renderAdminPage('/admin', overviewData({ emailDeliveryIssues: 2, operational: { alerts, requestMetrics: { recentByFamily: {} }, execution: {}, email: {} } }));
  assert.doesNotMatch(html, /autosave\.recent_failures|auth\.authorization_denials|email\.delivery_issues|execution\.infrastructure_failures/);
  assert.match(html, /Autosave failures/);
  assert.match(html, /Authorization denials/);
  assert.equal((html.match(/delivery issue/g) || []).length >= 1, true);
  assert.doesNotMatch(html, /Review accounts/);
  assert.doesNotMatch(html, /issue\(s\)/);
});

test('overview pluralizes single issues, rounds p95 and hides families without traffic', () => {
  const html = renderAdminPage('/admin', overviewData({
    emailDeliveryIssues: 1,
    operational: {
      alerts: [],
      requestMetrics: { recentByFamily: {
        api: { requests: 9, failures: 0, p95LatencyMs: 744.6 },
        mcp: { requests: 0, failures: 0, p95LatencyMs: null },
        web: { requests: 0, failures: 0, p95LatencyMs: null },
      } },
      execution: {},
      email: {},
    },
  }));
  assert.match(html, /1 email delivery issue\b/);
  assert.match(html, /1 issue\b/);
  assert.match(html, /745 ms/);
  assert.doesNotMatch(html, /744\.6/);
  assert.doesNotMatch(html, /<th scope="row">mcp<\/th>/);
  assert.equal((html.match(/Recent request metrics/g) || []).length, 1);
});
