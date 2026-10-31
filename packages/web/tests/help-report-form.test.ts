import test from 'node:test';
import assert from 'node:assert/strict';
import { renderHelpPage } from '../src/pages/public/HelpPage.ts';

test('The help report form has no code-draft option because the help page has no code to send', () => {
  const html = renderHelpPage({ courseId: 'course-py-101', isReportModalOpen: true });
  assert.ok(!html.includes('report-include-code'));
  assert.ok(!/code draft/i.test(html));
});
