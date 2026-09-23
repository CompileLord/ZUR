import test from 'node:test';
import assert from 'node:assert';
import {
  renderLoadingSkeleton,
  renderEmptyState,
  renderNoMatchesState,
  renderAccessDeniedState,
  renderNotFoundState,
  renderOfflineBanner,
  renderSaveFailureAlert,
  renderRateLimitAlert,
  renderJobQueuedState,
  renderInfrastructureFailurePanel,
  renderConflictComparisonModal,
} from '../src/components/states/UniversalStates.ts';

test('Universal State Contract (design.md §15, T011)', async (t) => {
  await t.test('Loading skeleton accessibility and semantics', () => {
    const skeleton = renderLoadingSkeleton('Loading course content');
    assert.strictEqual(skeleton.includes('role="status"'), true);
    assert.strictEqual(skeleton.includes('aria-busy="true"'), true);
    assert.strictEqual(skeleton.includes('Loading course content'), true);
  });

  await t.test('Empty state contains single focused next action', () => {
    const empty = renderEmptyState({
      title: 'No courses yet',
      message: 'Explore published courses to begin learning Python.',
      actionText: 'Explore courses',
      actionHref: '/courses',
    });
    assert.strictEqual(empty.includes('No courses yet'), true);
    assert.strictEqual(empty.includes('Explore courses'), true);
  });

  await t.test('No filter matches state retains query and offers clear filters', () => {
    const noMatches = renderNoMatchesState('Quantum Physics', '/courses');
    assert.strictEqual(noMatches.includes('Quantum Physics'), true);
    assert.strictEqual(noMatches.includes('Clear filters'), true);
  });

  await t.test('Safe denial states (P42) avoid leaking private resource details', () => {
    const denied = renderAccessDeniedState();
    assert.strictEqual(denied.includes("This page isn't available."), true);
    assert.strictEqual(denied.includes('Return to courses'), true);

    const notFound = renderNotFoundState();
    assert.strictEqual(notFound.includes("This page isn't available."), true);
  });

  await t.test('Offline and save failure alerts communicate truth about persistence', () => {
    const offline = renderOfflineBanner();
    assert.strictEqual(offline.includes('You are offline. Changes are stored on this device.'), true);

    const saveFail = renderSaveFailureAlert('retry()');
    assert.strictEqual(saveFail.includes('Could not save changes to server. Your edits are held locally.'), true);
    assert.strictEqual(saveFail.includes('Retry'), true);
  });

  await t.test('Rate limit alert preserves code and shows cooldown duration', () => {
    const rateLimit = renderRateLimitAlert(45);
    assert.strictEqual(rateLimit.includes('wait 45 seconds'), true);
    assert.strictEqual(rateLimit.includes('Your code has been preserved.'), true);
  });

  await t.test('Queued/running state displays attempt ID and live status', () => {
    const queued = renderJobQueuedState('job-123', 'QUEUED');
    assert.strictEqual(queued.includes('Queued for execution…'), true);
    assert.strictEqual(queued.includes('job-123'), true);

    const running = renderJobQueuedState('job-123', 'RUNNING');
    assert.strictEqual(running.includes('Running tests…'), true);
  });

  await t.test('Infrastructure failure distinguishes runner issue from learner mistake', () => {
    const infra = renderInfrastructureFailurePanel('job-999');
    assert.strictEqual(infra.includes("We couldn't check this submission."), true);
    assert.strictEqual(infra.includes('A temporary runner issue prevented completion.'), true);
    assert.strictEqual(infra.includes('Try again'), true);
  });

  await t.test('Conflict modal presents side-by-side comparison without silent overwrite', () => {
    const conflict = renderConflictComparisonModal({
      localContent: 'print("my edit")',
      serverContent: 'print("remote edit")',
      currentRevision: 4,
      onKeepLocal: 'keep()',
      onAcceptServer: 'accept()',
    });
    assert.strictEqual(conflict.includes('Resolve conflicting edits'), true);
    assert.strictEqual(conflict.includes('Revision 4'), true);
    assert.strictEqual(conflict.includes('print(&quot;my edit&quot;)'), true);
    assert.strictEqual(conflict.includes('print(&quot;remote edit&quot;)'), true);
  });
});
