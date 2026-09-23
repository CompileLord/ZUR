import './styles/tokens.css';
import './styles/typography.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/shells.css';

import { matchRoute } from './router/routes.ts';
import {
  renderPublicShell,
  renderAccountShell,
  renderAppShell,
  renderLearningWorkspaceShell,
  renderAuthorWorkspaceShell,
  renderAdminShell,
} from './components/shells/index.ts';
import {
  renderCourseRow,
  renderButton,
  renderTextInput,
  renderLessonRail,
  renderContentTree,
  renderProgressLine,
} from './components/common/index.ts';
import { renderNotFoundState } from './components/states/UniversalStates.ts';

const appEl = document.getElementById('app')!;

function initTheme(): void {
  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement | null;
  if (themeSelect) {
    const currentTheme = localStorage.getItem('zur_theme_preference') || 'system';
    themeSelect.value = currentTheme;
    themeSelect.addEventListener('change', (e) => {
      const selected = (e.target as HTMLSelectElement).value;
      localStorage.setItem('zur_theme_preference', selected);
      let resolved = selected;
      if (selected === 'system') {
        resolved = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
      }
      document.documentElement.setAttribute('data-theme', resolved);
      document.documentElement.style.colorScheme = resolved;
    });
  }
}

export function renderApp(path: string = window.location.pathname): void {
  const match = matchRoute(path);

  if (!match) {
    appEl.innerHTML = renderPublicShell({
      content: renderNotFoundState(),
    });
    initTheme();
    return;
  }

  const { route, params } = match;

  switch (route.shell) {
    case 'S1': {
      let content = '';
      if (route.pageId === 'P01') {
        content = `
          <section class="container-landing py-12">
            <h1 class="display-title mb-4">Understand it. Then write it.</h1>
            <p class="prose text-secondary mb-6">
              Learn Python through short lessons and real exercises. Create a course that puts practice beside the explanation.
            </p>
            <div class="landing-actions flex gap-4 mb-10">
              <a href="/courses" class="btn btn-primary">Explore courses</a>
              <a href="#teaching" class="btn btn-secondary">See how teaching works</a>
            </div>

            <!-- Representative Workspace Fragment (design §10 P01) -->
            <div class="workspace-fragment code-block p-6 mb-12">
              <div class="flex justify-between items-center mb-3">
                <span class="text-sm font-semibold text-secondary">Example workspace</span>
                <span class="text-xs text-muted">Python 3.12</span>
              </div>
              <pre><code># Calculate doubled values
numbers = [1, 2, 3, 4]
doubled = [n * 2 for n in numbers]
print("Result:", doubled)</code></pre>
              <div class="mt-4 pt-3 border-t border-subtle">
                <span class="text-xs text-muted">Sample output:</span>
                <pre class="text-sm text-primary mt-1"><code>Result: [2, 4, 6, 8]</code></pre>
              </div>
            </div>

            <div class="grid grid-cols-3 gap-8 mb-12">
              <div>
                <h3 class="font-semibold text-primary mb-2">1. Read</h3>
                <p class="text-sm text-secondary">Focused concept explanations with clear syntax and real examples.</p>
              </div>
              <div>
                <h3 class="font-semibold text-primary mb-2">2. Try</h3>
                <p class="text-sm text-secondary">Write real Python code in the browser. Zero software installation.</p>
              </div>
              <div>
                <h3 class="font-semibold text-primary mb-2">3. Check</h3>
                <p class="text-sm text-secondary">Instant feedback against public test cases and protected hidden checks.</p>
              </div>
            </div>
          </section>
        `;
      } else if (route.pageId === 'P02') {
        content = `
          <div class="container py-8">
            <h1 class="h1 mb-4">Explore courses</h1>
            <div class="course-list">
              ${renderCourseRow({
                id: 'course-python-foundations',
                title: 'Python foundations',
                description: 'Learn Python through short lessons and real exercises. Understand it, then write it.',
                authorName: 'Guido van Rossum',
                level: 'Beginner',
                durationText: '45 mins',
                actionText: 'View course',
                actionHref: '/courses/course-python-foundations',
              })}
            </div>
          </div>
        `;
      } else {
        content = `<div class="container py-8"><h1 class="h1">${route.title}</h1></div>`;
      }

      appEl.innerHTML = renderPublicShell({
        activePath: path,
        content,
      });
      break;
    }

    case 'S2': {
      let formContent = '';
      if (route.pageId === 'P04') {
        formContent = `
          <form action="/api/auth/sign-in" method="POST">
            ${renderTextInput({ id: 'email', name: 'email', label: 'Email', type: 'email', required: true })}
            ${renderTextInput({ id: 'password', name: 'password', label: 'Password', type: 'password', required: true })}
            <div class="flex justify-between items-center mb-4">
              <a href="/forgot-password" class="text-sm text-secondary">Forgot password?</a>
            </div>
            ${renderButton({ label: 'Sign in', variant: 'primary', type: 'submit', className: 'w-full' })}
            <p class="text-sm text-muted text-center mt-4">
              Don't have an account? <a href="/sign-up" class="text-primary underline">Create an account</a>
            </p>
          </form>
        `;
      } else if (route.pageId === 'P05') {
        formContent = `
          <form action="/api/auth/sign-up" method="POST">
            ${renderTextInput({ id: 'displayName', name: 'displayName', label: 'Display name', required: true })}
            ${renderTextInput({ id: 'email', name: 'email', label: 'Email', type: 'email', required: true })}
            ${renderTextInput({ id: 'password', name: 'password', label: 'Password', type: 'password', required: true, hint: 'At least 8 characters' })}
            ${renderButton({ label: 'Create account', variant: 'primary', type: 'submit', className: 'w-full' })}
          </form>
        `;
      } else {
        formContent = `<p>${route.title}</p>`;
      }

      appEl.innerHTML = renderAccountShell({
        title: route.title,
        formContent,
      });
      break;
    }

    case 'S3': {
      const mockUser = {
        displayName: 'Ada Lovelace',
        email: 'ada@zur.internal',
        capabilities: ['student' as const, 'author' as const],
      };

      const content = `
        <div class="dashboard-resume-panel card p-6 mb-8 border border-subtle bg-surface rounded-lg">
          <span class="text-xs uppercase text-muted font-semibold tracking-wide">Continue learning</span>
          <h2 class="text-xl font-semibold mt-1 mb-2">Python foundations</h2>
          <p class="text-sm text-secondary mb-4">Lesson 1: Naming and Values · Step 4: Echoing Numbers</p>
          <div class="mb-4">
            ${renderProgressLine({ satisfiedRequiredCount: 3, totalRequiredCount: 4 })}
          </div>
          <a href="/learn/enr-ada/steps/step-4-python-echo/code" class="btn btn-primary">Resume step</a>
        </div>
      `;

      appEl.innerHTML = renderAppShell({
        activePath: path,
        user: mockUser,
        currentMode: path.startsWith('/teach') ? 'teach' : 'learn',
        headerTitle: route.title,
        content,
      });
      break;
    }

    case 'S4': {
      appEl.innerHTML = renderLearningWorkspaceShell({
        courseTitle: 'Python foundations',
        courseOverviewUrl: '/learn/enr-ada',
        lessonTitle: 'Naming and Values',
        stepTitle: 'Echoing Numbers',
        stepOrdinalText: 'Step 4 of 4',
        isPythonWorkspace: route.pageId === 'P15',
        saveStatusText: 'Saved',
        outlineContent: renderLessonRail({
          steps: [
            { id: '1', ordinal: 1, title: 'What is a variable?', type: 'theory', isCurrent: false, isCompleted: true, isRequired: true },
            { id: '2', ordinal: 2, title: 'Variables in Memory', type: 'video', isCurrent: false, isCompleted: true, isRequired: true },
            { id: '3', ordinal: 3, title: 'Variable assignment syntax', type: 'quiz', isCurrent: false, isCompleted: true, isRequired: true },
            { id: '4', ordinal: 4, title: 'Echoing Numbers', type: 'python', isCurrent: true, isCompleted: false, isRequired: true },
          ],
        }),
        workspaceContent: `
          <div class="problem-pane p-4 overflow-y-auto border-r border-subtle">
            <h2 class="text-lg font-semibold mb-2">Echoing Numbers</h2>
            <p class="text-sm text-secondary mb-4">Read an integer from standard input and print twice its value.</p>
            <h4 class="font-semibold text-xs text-muted uppercase mb-1">Constraints</h4>
            <p class="text-sm text-secondary mb-4"><code>1 &lt;= N &lt;= 10^6</code></p>
            <h4 class="font-semibold text-xs text-muted uppercase mb-1">Input Format</h4>
            <p class="text-sm text-secondary mb-4">A single integer on standard input.</p>
          </div>
          <div class="code-pane p-4 flex flex-col">
            <div class="code-editor-header flex justify-between items-center mb-2">
              <span class="text-xs text-muted">solution.py</span>
              <span class="text-xs text-muted">Python 3.12</span>
            </div>
            <textarea class="form-input flex-1 font-mono text-sm" style="resize: none;" aria-label="Python code editor">import sys
val = int(sys.stdin.read().strip())
print(val * 2)
</textarea>
            <div class="results-pane mt-4 p-3 bg-raised rounded border border-subtle">
              <span class="text-xs font-semibold text-muted uppercase">Results</span>
              <p class="text-sm text-secondary mt-1">No runs yet. Try a sample first.</p>
            </div>
          </div>
        `,
        taskActions: `
          ${renderButton({ label: 'Run samples', variant: 'secondary', compact: true })}
          ${renderButton({ label: 'Submit solution', variant: 'primary', compact: true })}
        `,
      });
      break;
    }

    case 'S5': {
      appEl.innerHTML = renderAuthorWorkspaceShell({
        courseId: params.courseId || 'course-python-foundations',
        courseTitle: 'Python foundations',
        publicationState: 'published',
        hasUnpublishedChanges: false,
        saveStatusText: 'Saved',
        activeTab: 'content',
        treeContent: renderContentTree({
          courseTitle: 'Python foundations',
          modules: [
            {
              id: 'm1',
              title: 'Variables',
              lessons: [
                {
                  id: 'l1',
                  title: 'Naming and Values',
                  steps: [
                    { id: 's1', title: 'What is a variable?', type: 'theory' },
                    { id: 's2', title: 'Variables in Memory', type: 'video' },
                    { id: 's3', title: 'Variable assignment syntax', type: 'quiz' },
                    { id: 's4', title: 'Echoing Numbers', type: 'python', isSelected: true },
                  ],
                },
              ],
            },
          ],
        }),
        editorContent: `
          <div class="exercise-editor">
            <h2 class="text-xl font-semibold mb-4">Edit Python Exercise: Echoing Numbers</h2>
            <div class="tabs-nav mb-4">
              <button class="tab-link active" aria-selected="true">Problem</button>
              <button class="tab-link" aria-selected="false">Code</button>
              <button class="tab-link" aria-selected="false">Tests (2)</button>
              <button class="tab-link" aria-selected="false">Validation</button>
            </div>
            ${renderTextInput({ id: 'step-title', name: 'title', label: 'Exercise Title', value: 'Echoing Numbers' })}
          </div>
        `,
        inspectorContent: `
          <div class="p-4">
            <h3 class="font-semibold text-sm mb-3">Exercise Settings</h3>
            ${renderTextInput({ id: 'duration', name: 'duration', label: 'Estimated duration (minutes)', value: '10' })}
          </div>
        `,
      });
      break;
    }

    case 'S6': {
      appEl.innerHTML = renderAdminShell({
        activePath: path,
        adminUser: { displayName: 'Margaret Hamilton', email: 'margaret@zur.internal' },
        headerTitle: route.title,
        content: `
          <div class="admin-overview-card p-6 bg-surface border border-subtle rounded-lg">
            <div class="flex items-center gap-2 mb-4">
              <span class="status-badge success">Healthy</span>
              <span class="text-xs text-muted">Platform Operational</span>
            </div>
            <p class="text-sm text-secondary">All execution workers, queue dispatchers, and database clusters are operating within normal budgets.</p>
          </div>
        `,
      });
      break;
    }
  }

  initTheme();
}

window.addEventListener('popstate', () => {
  renderApp();
});

// Initial paint
renderApp();
