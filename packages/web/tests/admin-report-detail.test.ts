import test from 'node:test';
import assert from 'node:assert/strict';
import { renderAdminPage } from '../src/pages/admin/AdminPages.ts';

const report = {
  id: 'rep-1',
  type: 'content_issue',
  status: 'resolved',
  description: 'The example is wrong.',
  courseId: 'c1',
  courseTitle: 'Python Foundations',
  stepId: null,
  reporterName: 'Ada Learner',
  createdAt: '2026-10-02T08:30:00.000Z',
  resolutionOutcome: 'Corrected the example',
  internalNotes: 'Checked with author',
};

test('report detail shows reporter, submitted time and the saved outcome', () => {
  const html = renderAdminPage('/admin/reports/rep-1', report);
  assert.match(html, /<dt>Reporter<\/dt><dd>Ada Learner<\/dd>/);
  assert.match(html, /<dt>Submitted<\/dt><dd><time datetime="2026-10-02T08:30:00.000Z"/);
  assert.match(html, /<dt>Outcome<\/dt><dd>Corrected the example<\/dd>/);
});

test('report detail pre-fills the outcome field with the saved outcome', () => {
  const html = renderAdminPage('/admin/reports/rep-1', report);
  assert.match(html, /name="outcome"[^>]*value="Corrected the example"/);
  const open = renderAdminPage('/admin/reports/rep-1', { ...report, status: 'open', resolutionOutcome: null });
  assert.match(open, /<dt>Outcome<\/dt><dd><span class="text-muted">Not recorded<\/span><\/dd>/);
  assert.doesNotMatch(open, /name="outcome"[^>]*value="/);
});

test('reporter names and outcomes are escaped on the report detail', () => {
  const html = renderAdminPage('/admin/reports/rep-1', { ...report, reporterName: '<b>x</b>', resolutionOutcome: '"><script>1</script>' });
  assert.doesNotMatch(html, /<b>x<\/b>/);
  assert.doesNotMatch(html, /<script>1/);
  assert.match(html, /<dd>&lt;b&gt;x&lt;\/b&gt;<\/dd>/);
});
