import test from 'node:test';
import assert from 'node:assert';
import {
  renderPublicShell,
  renderAccountShell,
  renderAppShell,
  renderLearningWorkspaceShell,
  renderAuthorWorkspaceShell,
  renderAdminShell,
} from '../src/components/shells/index.ts';

test('Reusable Layout Shells S1–S6 (design.md §5, T009)', async (t) => {
  await t.test('S1 Public Shell structure and landmarks', () => {
    const html = renderPublicShell({
      activePath: '/courses',
      user: null,
      content: '<p>Public Catalog</p>',
    });

    assert.strictEqual(html.includes('role="banner"'), true);
    assert.strictEqual(html.includes('role="main"'), true);
    assert.strictEqual(html.includes('role="contentinfo"'), true);
    assert.strictEqual(html.includes('wordmark-citron'), true);
    assert.strictEqual(html.includes('Sign in'), true);
    assert.strictEqual(html.includes('Public Catalog'), true);
  });

  await t.test('S2 Account Shell centered card structure', () => {
    const html = renderAccountShell({
      title: 'Welcome back',
      subtitle: 'Sign in to continue learning',
      formContent: '<form><input type="email"/></form>',
    });

    assert.strictEqual(html.includes('account-card'), true);
    assert.strictEqual(html.includes('Welcome back'), true);
    assert.strictEqual(html.includes('wordmark'), true);
    assert.strictEqual(html.includes('Help'), true);
    assert.strictEqual(html.includes('Privacy'), true);
    assert.strictEqual(html.includes('Terms'), true);
  });

  await t.test('S3 Application Shell with mode switch & role privileges', () => {
    const authorUser = {
      displayName: 'Guido van Rossum',
      email: 'guido@zur.internal',
      capabilities: ['student' as const, 'author' as const, 'admin' as const],
    };

    const html = renderAppShell({
      activePath: '/learn',
      user: authorUser,
      currentMode: 'learn',
      headerTitle: 'Continue learning',
      content: '<div>Dashboard Content</div>',
    });

    assert.strictEqual(html.includes('mode-switch'), true); // Author has Learn/Teach mode switch
    assert.strictEqual(html.includes('Administration'), true); // Admin has Administration link
    assert.strictEqual(html.includes('Guido van Rossum'), true);
    assert.strictEqual(html.includes('Continue learning'), true);
  });

  await t.test('S3 treats account names as text', () => {
    const html = renderAppShell({ activePath: '/learn', user: { displayName: '<img src=x onerror="alert(1)">', email: 'x@example.test', capabilities: ['student'] }, headerTitle: '<script>alert(1)</script>', content: '' });
    assert.ok(html.includes('&lt;img src=x onerror=&quot;alert(1)&quot;&gt;'));
    assert.ok(html.includes('&lt;script&gt;alert(1)&lt;/script&gt;'));
    assert.ok(!html.includes('<img src=x'));
    assert.ok(!html.includes('<script>alert(1)</script>'));
  });

  await t.test('S4 Learning Workspace paired layout & compact guidance for Python', () => {
    const html = renderLearningWorkspaceShell({
      courseTitle: 'Python foundations',
      courseOverviewUrl: '/learn/course-1',
      lessonTitle: 'Naming and Values',
      stepTitle: 'Echoing Numbers',
      stepOrdinalText: 'Step 4 of 4',
      isPythonWorkspace: true,
      saveStatusText: 'Saved',
      outlineContent: '<div>Outline items</div>',
      workspaceContent: '<div>Problem & Editor</div>',
    });

    assert.strictEqual(html.includes('paired-workspace'), true);
    assert.strictEqual(html.includes('desktop-guidance-banner'), true);
    assert.strictEqual(html.includes('Open this exercise on a computer to write and run code.'), true);
    assert.strictEqual(html.includes('Saved'), true);
  });

  await t.test('S5 Author Workspace with contextual tabs and tree pane', () => {
    const html = renderAuthorWorkspaceShell({
      courseId: 'c-1',
      courseTitle: 'Python foundations',
      publicationState: 'published',
      hasUnpublishedChanges: true,
      saveStatusText: 'Saved',
      activeTab: 'content',
      treeContent: '<div>Course Tree</div>',
      editorContent: '<div>Exercise Editor</div>',
    });

    assert.strictEqual(html.includes('Published (Unpublished changes)'), true);
    assert.strictEqual(html.includes('author-tree-pane'), true);
    assert.strictEqual(html.includes('Content'), true);
    assert.strictEqual(html.includes('Students'), true);
    assert.strictEqual(html.includes('Analytics'), true);
    assert.strictEqual(html.includes('Settings'), true);
  });

  await t.test('S6 Administration Shell displays acting admin identity', () => {
    const html = renderAdminShell({
      activePath: '/admin/users',
      adminUser: { displayName: 'Margaret Hamilton', email: 'margaret@zur.internal' },
      headerTitle: 'Users and capabilities',
      content: '<div>User table</div>',
    });

    assert.strictEqual(html.includes('shell-admin'), true);
    assert.strictEqual(html.includes('Administration'), true);
    assert.strictEqual(html.includes('Acting Admin'), true);
    assert.strictEqual(html.includes('Margaret Hamilton'), true);
    assert.strictEqual(html.includes('/admin/audit'), true);
  });
});
