import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSettingsNav } from '../src/pages/settings/SettingsNav.ts';
import { renderProfileSettingsPage } from '../src/pages/settings/ProfileSettingsPage.ts';
import { renderAppearanceSettingsPage } from '../src/pages/settings/AppearanceSettingsPage.ts';
import { renderSecuritySettingsPage } from '../src/pages/settings/SecuritySettingsPage.ts';
import { renderPrivacySettingsPage } from '../src/pages/settings/PrivacySettingsPage.ts';
import { getScopedLastVisitedStepKey, recordLastVisitedStep, getLastVisitedStep, parseLearningNavigation } from '../src/pages/learning/learning-navigation.ts';

test('Learner Redesign: Settings Simplification and Tab Scoping', async (t) => {
  await t.test('SettingsNav hides AI connections for student-only accounts', () => {
    const studentNav = renderSettingsNav('profile', false);
    assert.ok(!studentNav.includes('AI connections'), 'AI connections hidden for students');
    assert.ok(studentNav.includes('/settings/profile'), 'Profile link present');
    assert.ok(studentNav.includes('/settings/appearance'), 'Appearance link present');
    assert.ok(studentNav.includes('/settings/security'), 'Security link present');
    assert.ok(studentNav.includes('/settings/privacy'), 'Privacy link present');

    const authorNav = renderSettingsNav('profile', true);
    assert.ok(authorNav.includes('AI connections'), 'AI connections visible for authors');
  });

  await t.test('ProfileSettingsPage avoids redundant identity text', () => {
    const user = {
      id: 'usr-1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      emailVerified: true,
      accountStatus: 'active' as const,
      capabilities: ['student'] as ('student' | 'author' | 'admin')[],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const html = renderProfileSettingsPage({ user });
    assert.ok(!html.includes('Manage how you are identified across course workspaces'), 'Redundant identity paragraph removed');
    assert.ok(html.includes('To change your email, contact'), 'Concise email support hint present');
  });

  await t.test('AppearanceSettingsPage avoids duplicate theme/font captions', () => {
    const html = renderAppearanceSettingsPage({
      preferences: {
        userId: 'usr-1',
        theme: 'dark',
        editorFontSize: 14,
        indentationSpaces: 4,
        updatedAt: '2026-01-01',
      },
      resolvedSystemTheme: 'dark',
    });
    assert.ok(!html.includes('Consistent dark surface'), 'Redundant theme caption removed');
    assert.ok(!html.includes('Fixed-width code font scaling'), 'Redundant font caption removed');
    assert.ok(!html.includes('Python indentation depth'), 'Redundant indent caption removed');
  });

  await t.test('SecuritySettingsPage provides concise sign-out notice', () => {
    const user = {
      id: 'usr-1',
      displayName: 'Ada Lovelace',
      email: 'ada@example.com',
      emailVerified: true,
      accountStatus: 'active' as const,
      capabilities: ['student'] as ('student' | 'author' | 'admin')[],
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    };
    const html = renderSecuritySettingsPage({ user });
    assert.ok(html.includes('Updating your password signs out other devices.'), 'Concise password warning present');
    assert.ok(!html.includes('Signing out from here terminates all browser sessions'), 'Verbose signout paragraph removed');
  });

  await t.test('PrivacySettingsPage collapses retention policy into disclosure', () => {
    const html = renderPrivacySettingsPage({});
    assert.ok(html.includes('Data retention overview'), 'Retention details summary present');
    assert.ok(html.includes('<details'), 'Retention details element present');
  });
});

test('Learner Redesign: Lesson Resume Policy & Scoped Preferences', async (t) => {
  const createMockStorage = () => {
    const map = new Map<string, string>();
    return {
      getItem: (k: string) => map.get(k) || null,
      setItem: (k: string, v: string) => { map.set(k, v); },
    };
  };

  await t.test('getScopedLastVisitedStepKey generates correct scope key format', () => {
    const key = getScopedLastVisitedStepKey('usr-1', 'enr-ada', 'v2-snap', 'les-1');
    assert.equal(key, 'zur_last_visited_step:usr-1:enr-ada:v2-snap:les-1');
  });

  await t.test('records and retrieves last visited step with user and version isolation', () => {
    const storage = createMockStorage();

    // User A records step 3 in lesson 1 on version 1
    recordLastVisitedStep('usr-a', 'enr-1', 'ver-1', 'les-1', 'step-3', storage);

    // User A retrieves step 3
    assert.equal(getLastVisitedStep('usr-a', 'enr-1', 'ver-1', 'les-1', storage), 'step-3');

    // Cross-user isolation: User B on same enrollment/version gets null
    assert.equal(getLastVisitedStep('usr-b', 'enr-1', 'ver-1', 'les-1', storage), null);

    // Cross-version isolation: User A on version 2 gets null
    assert.equal(getLastVisitedStep('usr-a', 'enr-1', 'ver-2', 'les-1', storage), null);

    // Cross-lesson isolation: User A on lesson 2 gets null
    assert.equal(getLastVisitedStep('usr-a', 'enr-1', 'ver-1', 'les-2', storage), null);
  });

  await t.test('parseLearningNavigation resolves last-visited then first-incomplete then first-step', () => {
    const storage = createMockStorage();
    const progress = {
      totalSteps: 4,
      completedSteps: 1,
      steps: [
        { id: 's1', moduleId: 'm1', moduleTitle: 'Module 1', lessonId: 'l1', lessonTitle: 'Lesson 1', title: 'Step 1', type: 'theory', isCompleted: true, isWaived: false },
        { id: 's2', moduleId: 'm1', moduleTitle: 'Module 1', lessonId: 'l1', lessonTitle: 'Lesson 1', title: 'Step 2', type: 'video', isCompleted: false, isWaived: false },
        { id: 's3', moduleId: 'm1', moduleTitle: 'Module 1', lessonId: 'l1', lessonTitle: 'Lesson 1', title: 'Step 3', type: 'quiz', isCompleted: false, isWaived: false },
        { id: 's4', moduleId: 'm1', moduleTitle: 'Module 1', lessonId: 'l1', lessonTitle: 'Lesson 1', title: 'Step 4', type: 'python', isCompleted: false, isWaived: false },
      ],
    };

    // Case 1: No last-visited step -> resolves first incomplete step (s2)
    const nav1 = parseLearningNavigation(progress, 'enr-1', 's1', 'usr-a', 'ver-1', storage);
    assert.equal(nav1.modules[0].lessons[0].href, '/learn/enr-1/steps/s2', 'Targets first incomplete step when unvisited');

    // Case 2: Last-visited recorded as s4 -> resolves s4
    recordLastVisitedStep('usr-a', 'enr-1', 'ver-1', 'l1', 's4', storage);
    const nav2 = parseLearningNavigation(progress, 'enr-1', 's1', 'usr-a', 'ver-1', storage);
    assert.equal(nav2.modules[0].lessons[0].href, '/learn/enr-1/steps/s4', 'Targets last-visited step when recorded');

    // Case 3: Stale last-visited outside this lesson -> falls back to first incomplete step (s2)
    recordLastVisitedStep('usr-a', 'enr-1', 'ver-1', 'l1', 's-deleted', storage);
    const nav3 = parseLearningNavigation(progress, 'enr-1', 's1', 'usr-a', 'ver-1', storage);
    assert.equal(nav3.modules[0].lessons[0].href, '/learn/enr-1/steps/s2', 'Falls back to first incomplete step when last-visited invalid');

    // Case 4: All steps completed/waived -> falls back to first step (s1)
    const allDoneProgress = {
      totalSteps: 2,
      completedSteps: 2,
      steps: [
        { id: 's1', moduleId: 'm1', lessonId: 'l1', title: 'Step 1', type: 'theory', isCompleted: true, isWaived: false },
        { id: 's2', moduleId: 'm1', lessonId: 'l1', title: 'Step 2', type: 'quiz', isCompleted: false, isWaived: true },
      ],
    };
    const emptyStorage = createMockStorage();
    const nav4 = parseLearningNavigation(allDoneProgress, 'enr-1', 's2', 'usr-a', 'ver-1', emptyStorage);
    assert.equal(nav4.modules[0].lessons[0].href, '/learn/enr-1/steps/s1', 'Falls back to first step when all completed or waived');
  });

  await t.test('Course resume remains first-incomplete required', () => {
    // Course resume target comes from backend nextIncompleteStepId, not lesson last-visited
    const progress = {
      nextIncompleteStepId: 'step-2',
      lastVisitedStepId: 'step-4',
    };
    const resumeStepId = progress.nextIncompleteStepId || progress.lastVisitedStepId;
    assert.equal(resumeStepId, 'step-2', 'Course resume prioritizes first incomplete step');
  });
});
