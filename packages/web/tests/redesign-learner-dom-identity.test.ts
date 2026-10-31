import test from 'node:test';
import assert from 'node:assert/strict';
import { renderSidebarContentHtml, renderTaskSquareInnerHtml, type CourseModuleItem } from '../src/components/shells/LearningWorkspaceShell.ts';
import { recordLastVisitedStep, parseLearningNavigation, updateMountedLearningWorkspace } from '../src/pages/learning/learning-navigation.ts';

test('Learner Redesign: DOM Identity, Glyph Synchronization & Scoped Navigation', async (t) => {
  await t.test('renderTaskSquareInnerHtml renders checkmark for completed, W for waived, and ordinal for incomplete', () => {
    const completedHtml = renderTaskSquareInnerHtml({ ordinal: 1, isCompleted: true });
    assert.ok(completedHtml.includes('check-icon'), 'Completed square contains check-icon');
    assert.ok(completedHtml.includes('svg'), 'Completed square contains SVG checkmark');

    const waivedHtml = renderTaskSquareInnerHtml({ ordinal: 2, isWaived: true });
    assert.ok(waivedHtml.includes('waived-letter'), 'Waived square contains waived-letter');
    assert.ok(waivedHtml.includes('>W<'), 'Waived square displays W glyph');

    const incompleteHtml = renderTaskSquareInnerHtml({ ordinal: 3 });
    assert.ok(incompleteHtml.includes('ordinal-number'), 'Incomplete square contains ordinal-number');
    assert.ok(incompleteHtml.includes('>3<'), 'Incomplete square displays ordinal 3');
  });

  await t.test('renderSidebarContentHtml embeds data-lesson-id and marks active lesson item', () => {
    const modules: CourseModuleItem[] = [
      {
        id: 'mod-1',
        title: 'Variables',
        lessons: [
          { id: 'les-1', title: 'Naming', completedCount: 3, totalCount: 4, isCurrent: true, href: '/learn/e1/steps/s1' },
          { id: 'les-2', title: 'Types', completedCount: 0, totalCount: 3, isCurrent: false, href: '/learn/e1/steps/s5' },
        ],
      },
    ];
    const html = renderSidebarContentHtml({ modules });
    assert.ok(html.includes('data-lesson-id="les-1"'), 'les-1 has data-lesson-id');
    assert.ok(html.includes('data-lesson-id="les-2"'), 'les-2 has data-lesson-id');
    assert.ok(html.includes('class="sidebar-lesson-item active" data-lesson-id="les-1"'), 'les-1 is active');
    assert.ok(html.includes('class="sidebar-lesson-item " data-lesson-id="les-2"'), 'les-2 is not active');
    assert.ok(html.includes('3/4'), 'les-1 shows 3/4 count');
  });

  await t.test('parseLearningNavigation resolves lastVisited, then firstIncomplete, then firstStep with user/version scoping', () => {
    const storage = new Map<string, string>();
    const mockStorage = {
      getItem: (k: string) => storage.get(k) || null,
      setItem: (k: string, v: string) => storage.set(k, v),
    };

    const progress = {
      steps: [
        { id: 'step-1', title: 'Step 1', type: 'theory', lessonId: 'les-1', isCompleted: true, isWaived: false },
        { id: 'step-2', title: 'Step 2', type: 'theory', lessonId: 'les-1', isCompleted: false, isWaived: false },
        { id: 'step-3', title: 'Step 3', type: 'python', lessonId: 'les-1', isCompleted: false, isWaived: false },
      ],
    };

    // User A records last visited step-3 on version-1
    recordLastVisitedStep('user-a', 'enr-1', 'ver-1', 'les-1', 'step-3', mockStorage);

    // User A navigates: targets last-visited step-3
    const navUserA = parseLearningNavigation(progress, 'enr-1', 'step-1', 'user-a', 'ver-1', mockStorage);
    assert.equal(navUserA.modules[0].lessons[0].href, '/learn/enr-1/steps/step-3', 'User A targets last-visited step-3');

    // User B on same enrollment & version: targets first incomplete step-2 (isolated from user A)
    const navUserB = parseLearningNavigation(progress, 'enr-1', 'step-1', 'user-b', 'ver-1', mockStorage);
    assert.equal(navUserB.modules[0].lessons[0].href, '/learn/enr-1/steps/step-2', 'User B targets first incomplete step-2');

    // User A on version-2: targets first incomplete step-2 (isolated from ver-1)
    const navUserAVer2 = parseLearningNavigation(progress, 'enr-1', 'step-1', 'user-a', 'ver-2', mockStorage);
    assert.equal(navUserAVer2.modules[0].lessons[0].href, '/learn/enr-1/steps/step-2', 'User A on ver-2 targets first incomplete step-2');
  });

  await t.test('updateMountedLearningWorkspace preserves shell and sidebar DOM identity during step change', () => {
    // Construct mock DOM element tree
    const createMockElement = (tagName: string, className = '', id = '') => {
      const attributes = new Map<string, string>();
      const classList = new Set(className.split(' ').filter(Boolean));
      const children: any[] = [];
      let parent: any = null;
      const el: any = {
        tagName,
        id,
        href: '',
        style: {} as Record<string, string>,
        dataset: {} as Record<string, string>,
        get className() { return [...classList].join(' '); },
        set className(val: string) { classList.clear(); val.split(' ').filter(Boolean).forEach(c => classList.add(c)); },
        classList: {
          contains: (c: string) => classList.has(c),
          add: (c: string) => classList.add(c),
          remove: (c: string) => classList.delete(c),
          toggle: (c: string, force?: boolean) => {
            const has = classList.has(c);
            const next = force !== undefined ? force : !has;
            if (next) classList.add(c); else classList.delete(c);
            return next;
          },
        },
        setAttribute: (k: string, v: string) => {
          attributes.set(k, String(v));
          if (k === 'id') el.id = v;
          if (k === 'href') el.href = v;
          if (k.startsWith('data-')) el.dataset[k.slice(5)] = String(v);
        },
        getAttribute: (k: string) => attributes.get(k) || (k === 'href' ? el.href : null),
        removeAttribute: (k: string) => { attributes.delete(k); },
        innerHTML: '',
        textContent: '',
        children,
        get parentElement() { return parent; },
        set parentElement(p: any) { parent = p; },
        appendChild: (child: any) => { children.push(child); child.parentElement = el; return child; },
        querySelector: (sel: string): any => {
          const match = (node: any): boolean => {
            if (sel === '.shell-learning') return node.classList?.contains('shell-learning');
            if (sel === '#course-sidebar') return node.id === 'course-sidebar' || node.classList?.contains('course-sidebar');
            if (sel === '.learning-workspace-main') return node.classList?.contains('learning-workspace-main');
            if (sel === '.learning-task-strip') return node.classList?.contains('learning-task-strip');
            if (sel === '.workspace-viewport') return node.classList?.contains('workspace-viewport');
            if (sel === '.learning-task-footer') return node.classList?.contains('learning-task-footer');
            if (sel === '.task-footer-left') return node.classList?.contains('task-footer-left');
            if (sel === '.task-footer-right') return node.classList?.contains('task-footer-right');
            if (sel === '.header-lesson-context') return node.classList?.contains('header-lesson-context');
            if (sel.includes('.back-link')) return node.classList?.contains('back-link');
            if (sel.includes('.back-link-title')) return node.classList?.contains('back-link-title');
            if (sel.includes('progress-bar-fill')) return node.classList?.contains('progress-bar-fill');
            if (sel.includes('progress-text')) return node.classList?.contains('progress-text');
            if (sel === '.lesson-item-count') return node.classList?.contains('lesson-item-count');
            if (sel.includes('prev-task') || sel.includes('first-child')) return node.classList?.contains('prev-task') || node.classList?.contains('task-nav-arrow');
            if (sel.includes('next-task') || sel.includes('last-child')) return node.classList?.contains('next-task') || node.classList?.contains('task-nav-arrow');
            return false;
          };
          const search = (node: any): any => {
            for (const child of node.children) {
              if (match(child)) return child;
              const found = search(child);
              if (found) return found;
            }
            return null;
          };
          return search(el);
        },
        querySelectorAll: (sel: string): any[] => {
          const results: any[] = [];
          const match = (node: any): boolean => {
            if (sel === '.task-square') return node.classList?.contains('task-square');
            if (sel === '.sidebar-lesson-item') return node.classList?.contains('sidebar-lesson-item');
            return false;
          };
          const search = (node: any) => {
            for (const child of node.children) {
              if (match(child)) results.push(child);
              search(child);
            }
          };
          search(el);
          return results;
        },
        scrollIntoView: () => {},
      };
      return el;
    };

    const mockRoot = createMockElement('div', 'app-root');
    const mockShell = createMockElement('div', 'shell-learning');
    const mockSidebar = createMockElement('aside', 'course-sidebar', 'course-sidebar');
    const mockMain = createMockElement('main', 'learning-workspace-main');
    const mockStrip = createMockElement('nav', 'learning-task-strip');
    const mockSquare1 = createMockElement('a', 'task-square selected current');
    mockSquare1.setAttribute('href', '/learn/e1/steps/s1');
    const mockSquare2 = createMockElement('a', 'task-square');
    mockSquare2.setAttribute('href', '/learn/e1/steps/s2');
    mockStrip.appendChild(mockSquare1);
    mockStrip.appendChild(mockSquare2);

    const mockLessonLink1 = createMockElement('a', 'sidebar-lesson-item active');
    mockLessonLink1.setAttribute('data-lesson-id', 'les-1');
    const mockCount1 = createMockElement('span', 'lesson-item-count');
    mockCount1.textContent = '0/2';
    mockLessonLink1.appendChild(mockCount1);
    mockLessonLink1.querySelector = (sel: string) => sel === '.lesson-item-count' ? mockCount1 : null;
    mockSidebar.appendChild(mockLessonLink1);

    const mockViewport = createMockElement('div', 'workspace-viewport');
    mockMain.appendChild(mockStrip);
    mockMain.appendChild(mockViewport);
    mockShell.appendChild(mockSidebar);
    mockShell.appendChild(mockMain);
    mockRoot.appendChild(mockShell);

    // Call updateMountedLearningWorkspace for step transition to s2 (s1 completed)
    const updated = updateMountedLearningWorkspace({
      courseTitle: 'Foundations',
      courseOverviewUrl: '/learn/e1',
      lessonTitle: 'Lesson 1',
      stepTitle: 'Step 2',
      stepOrdinalText: 'Step 2 of 2',
      modules: [{
        id: 'mod-1',
        title: 'Mod 1',
        lessons: [{ id: 'les-1', title: 'Lesson 1', completedCount: 1, totalCount: 2, isCurrent: true, href: '/learn/e1/steps/s2' }],
      }],
      taskSquares: [
        { id: 's1', ordinal: 1, title: 'Step 1', type: 'theory', isCurrent: false, isCompleted: true, isWaived: false, isRequired: true, href: '/learn/e1/steps/s1' },
        { id: 's2', ordinal: 2, title: 'Step 2', type: 'python', isCurrent: true, isCompleted: false, isWaived: false, isRequired: true, href: '/learn/e1/steps/s2' },
      ],
      workspaceContent: '<div>Step 2 Viewport</div>',
    }, mockRoot);

    assert.equal(updated, true, 'updateMountedLearningWorkspace returned true');
    // Verify DOM identity preserved:
    assert.equal(mockRoot.querySelector('.shell-learning'), mockShell, 'Shell DOM reference is identical (no teardown)');
    assert.equal(mockRoot.querySelector('#course-sidebar'), mockSidebar, 'Sidebar DOM reference is identical');
    assert.equal(mockMain.querySelector('.learning-task-strip'), mockStrip, 'Task strip DOM reference is identical (fast path in-place update)');

    // Verify task square states updated in-place:
    assert.ok(mockSquare1.classList.contains('completed'), 'Square 1 updated to completed');
    assert.ok(!mockSquare1.classList.contains('current'), 'Square 1 is no longer current');
    assert.ok(mockSquare1.innerHTML.includes('check-icon'), 'Square 1 has check-icon SVG');

    assert.ok(mockSquare2.classList.contains('current'), 'Square 2 is now current');
    assert.ok(mockSquare2.innerHTML.includes('ordinal-number'), 'Square 2 has ordinal number');

    // Verify sidebar updated:
    assert.equal(mockLessonLink1.href, '/learn/e1/steps/s2', 'Sidebar lesson link href synchronized to target');
    assert.equal(mockCount1.textContent, '1/2', 'Sidebar lesson count synchronized to 1/2');
  });
});
