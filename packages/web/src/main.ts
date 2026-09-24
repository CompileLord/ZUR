import './styles/tokens.css';
import './styles/typography.css';
import './styles/layout.css';
import './styles/components.css';
import './styles/shells.css';

import { matchRoute, getSafeReturnDestination } from './router/routes.ts';
import { AuthClient } from './services/auth-client.ts';
import {
  renderPublicShell,
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
import { renderSignInPage } from './pages/account/SignInPage.ts';
import { renderSignUpPage } from './pages/account/SignUpPage.ts';
import { renderVerifyEmailPage } from './pages/account/VerifyEmailPage.ts';
import { renderForgotPasswordPage, renderResetPasswordPage } from './pages/account/PasswordRecoveryPages.ts';
import { renderProfileSettingsPage } from './pages/settings/ProfileSettingsPage.ts';
import { renderAppearanceSettingsPage } from './pages/settings/AppearanceSettingsPage.ts';
import { renderSecuritySettingsPage } from './pages/settings/SecuritySettingsPage.ts';
import { renderPrivacySettingsPage } from './pages/settings/PrivacySettingsPage.ts';
import { renderAiConnectionsPage } from './pages/settings/AiConnectionsPage.ts';
import { renderMcpClientSetupPage } from './pages/settings/McpClientSetupDialog.ts';
import { renderSafeDenialPage } from './pages/status/SafeDenialPage.ts';


const appEl = document.getElementById('app')!;
const authClient = AuthClient.getInstance();

export function applyTheme(theme: 'dark' | 'light' | 'system'): void {
  localStorage.setItem('zur_theme_preference', theme);
  let resolved: 'dark' | 'light' = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;

  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
}

function initTheme(): void {
  const savedTheme = (localStorage.getItem('zur_theme_preference') as 'dark' | 'light' | 'system') || 'system';
  applyTheme(savedTheme);

  const themeSelect = document.getElementById('theme-select') as HTMLSelectElement | null;
  if (themeSelect) {
    themeSelect.value = savedTheme;
    themeSelect.addEventListener('change', (e) => {
      const selected = (e.target as HTMLSelectElement).value as 'dark' | 'light' | 'system';
      applyTheme(selected);
    });
  }
}

export function navigateTo(path: string): void {
  window.history.pushState({}, '', path);
  renderApp(path);
}

export function renderApp(path: string = window.location.pathname): void {
  const match = matchRoute(path);

  if (!match) {
    appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
    initTheme();
    return;
  }

  const { route, params } = match;
  const searchParams = new URLSearchParams(window.location.search);
  const currentUser = authClient.getUser();

  // Authentication guards for S3 (settings/learning), S4, S5, S6
  if (route.requiredCapability && !currentUser) {
    const returnTo = getSafeReturnDestination(path);
    navigateTo(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
    return;
  }

  switch (route.shell) {
    case 'S1': {
      if (route.pageId === 'P42') {
        const isAccessDenied = path === '/access-denied';
        appEl.innerHTML = renderSafeDenialPage({
          type: isAccessDenied ? 'access-denied' : 'not-found',
        });
        break;
      }

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
      // Account Pages (P04, P05, P06, P07)
      if (route.pageId === 'P04') {
        const returnTo = searchParams.get('returnTo') || '';
        appEl.innerHTML = renderSignInPage({ returnTo });
        attachSignInListeners();
      } else if (route.pageId === 'P05') {
        const returnTo = searchParams.get('returnTo') || '';
        appEl.innerHTML = renderSignUpPage({ returnTo });
        attachSignUpListeners();
      } else if (route.pageId === 'P06') {
        const token = searchParams.get('token');
        const email = currentUser?.email || searchParams.get('email') || '';
        appEl.innerHTML = renderVerifyEmailPage({ email });
        attachVerifyEmailListeners(token);
      } else if (route.pageId === 'P07') {
        const isReset = path === '/reset-password';
        if (isReset) {
          const token = searchParams.get('token') || '';
          appEl.innerHTML = renderResetPasswordPage({ token });
          attachResetPasswordListeners();
        } else {
          appEl.innerHTML = renderForgotPasswordPage();
          attachForgotPasswordListeners();
        }
      }
      break;
    }

    case 'S3': {
      // Authenticated Application & Settings Pages (P09-P11, P17-P20)
      const user = currentUser || {
        id: 'user-guest',
        displayName: 'Guest Learner',
        email: 'guest@zur.internal',
        emailVerified: false,
        capabilities: ['student' as const],
        accountStatus: 'active' as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let content = '';

      if (route.pageId === 'P17') {
        // Profile Settings
        appEl.innerHTML = renderAppShell({
          activePath: path,
          user,
          headerTitle: 'Profile settings',
          content: renderProfileSettingsPage({ user }),
        });
        attachProfileListeners();
      } else if (route.pageId === 'P18') {
        // Appearance Settings
        const savedTheme = (localStorage.getItem('zur_theme_preference') as 'dark' | 'light' | 'system') || 'system';
        const resolvedSystem = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
        appEl.innerHTML = renderAppShell({
          activePath: path,
          user,
          headerTitle: 'Appearance settings',
          content: renderAppearanceSettingsPage({
            preferences: {
              userId: user.id,
              theme: savedTheme,
              editorFontSize: 14,
              indentationSpaces: 4,
              updatedAt: new Date().toISOString(),
            },
            resolvedSystemTheme: resolvedSystem,
          }),
        });
        attachAppearanceListeners();
      } else if (route.pageId === 'P19') {
        // Security Settings
        appEl.innerHTML = renderAppShell({
          activePath: path,
          user,
          headerTitle: 'Security settings',
          content: renderSecuritySettingsPage({ user }),
        });
        attachSecurityListeners();
      } else if (route.pageId === 'P20') {
        // Privacy Settings
        appEl.innerHTML = renderAppShell({
          activePath: path,
          user,
          headerTitle: 'Privacy and account requests',
          content: renderPrivacySettingsPage({}),
        });
        attachPrivacyListeners();
      } else if (route.pageId === 'P43') {
        // AI Connections (P43)
        appEl.innerHTML = renderAppShell({
          activePath: path,
          user,
          headerTitle: 'AI connections',
          content: renderAiConnectionsPage({ user, tokens: [] }),
        });
      } else if (route.pageId === 'P44') {
        // MCP Client Setup (P44)
        const connectionId = params.connectionId || 'tok-sample';
        appEl.innerHTML = renderAppShell({
          activePath: path,
          user,
          headerTitle: 'Connection setup and verification',
          content: renderMcpClientSetupPage({
            token: {
              id: connectionId,
              tokenIdentifier: 'zat_sample',
              label: 'Sample Agent',
              scopes: ['courses:read', 'content:write'],
              courseRestrictions: null,
              expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
              isRevoked: false,
              lastUsedAt: null,
              createdAt: new Date().toISOString(),
              status: 'never_used',
            },
          }),
        });
      } else {

        // Default Student Dashboard (P09)
        content = `
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
          user,
          currentMode: path.startsWith('/teach') ? 'teach' : 'learn',
          headerTitle: route.title,
          content,
        });
      }
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

// --- DOM Event Listeners & Interaction Wiring ---

function attachSignInListeners(): void {
  const form = document.getElementById('sign-in-form') as HTMLFormElement | null;
  const togglePass = document.getElementById('toggle-password');
  const passInput = document.getElementById('password') as HTMLInputElement | null;
  const errorEl = document.getElementById('sign-in-error');

  if (togglePass && passInput) {
    togglePass.addEventListener('click', () => {
      const isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
      togglePass.textContent = isPass ? 'Hide password' : 'Show password';
      togglePass.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (form.elements.namedItem('email') as HTMLInputElement).value;
      const password = (form.elements.namedItem('password') as HTMLInputElement).value;
      const returnTo = (form.elements.namedItem('returnTo') as HTMLInputElement).value;
      const submitBtn = document.getElementById('submit-sign-in') as HTMLButtonElement | null;

      if (!email || !password) {
        if (errorEl) {
          errorEl.className = 'form-error mb-4 p-3 border border-danger rounded';
          errorEl.innerHTML = '<span aria-hidden="true">⚠</span> <span>Email and password are required.</span>';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Signing in…';
      }

      try {
        await authClient.signIn(email, password);
        const destination = getSafeReturnDestination(returnTo);
        navigateTo(destination);
      } catch (err: any) {
        if (errorEl) {
          errorEl.className = 'form-error mb-4 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${err.message || 'Invalid email or password.'}</span>`;
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Sign in';
        }
      }
    });
  }
}

function attachSignUpListeners(): void {
  const form = document.getElementById('sign-up-form') as HTMLFormElement | null;
  const togglePass = document.getElementById('toggle-password');
  const passInput = document.getElementById('password') as HTMLInputElement | null;
  const errorEl = document.getElementById('sign-up-error');

  if (togglePass && passInput) {
    togglePass.addEventListener('click', () => {
      const isPass = passInput.type === 'password';
      passInput.type = isPass ? 'text' : 'password';
      togglePass.textContent = isPass ? 'Hide password' : 'Show password';
      togglePass.setAttribute('aria-label', isPass ? 'Hide password' : 'Show password');
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const displayName = (form.elements.namedItem('displayName') as HTMLInputElement).value;
      const email = (form.elements.namedItem('email') as HTMLInputElement).value;
      const password = (form.elements.namedItem('password') as HTMLInputElement).value;
      const submitBtn = document.getElementById('submit-sign-up') as HTMLButtonElement | null;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account…';
      }

      try {
        await authClient.signUp(displayName, email, password);
        navigateTo(`/verify-email?email=${encodeURIComponent(email)}`);
      } catch (err: any) {
        if (errorEl) {
          errorEl.className = 'form-error mb-4 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${err.message || 'Could not create account.'}</span>`;
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Create account';
        }
      }
    });
  }
}

function attachVerifyEmailListeners(token?: string | null): void {
  if (token) {
    authClient.verifyEmail(token)
      .then(() => {
        appEl.innerHTML = renderVerifyEmailPage({ isVerified: true });
      })
      .catch((err) => {
        appEl.innerHTML = renderVerifyEmailPage({ error: err.message || 'Verification link expired or invalid.' });
      });
    return;
  }

  const resendForm = document.getElementById('resend-verification-form');
  if (resendForm) {
    resendForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (resendForm.querySelector('input[name="email"]') as HTMLInputElement)?.value;
      const resendBtn = document.getElementById('btn-resend-verification') as HTMLButtonElement | null;

      if (resendBtn) {
        resendBtn.disabled = true;
        resendBtn.textContent = 'Sending…';
      }

      try {
        await authClient.resendVerification(email);
        appEl.innerHTML = renderVerifyEmailPage({
          email,
          infoMessage: 'A new verification link has been sent to your email.',
          cooldownRemaining: 60,
        });
        startCooldownTimer(60, email);
      } catch (err: any) {
        appEl.innerHTML = renderVerifyEmailPage({
          email,
          error: err.message || 'Failed to resend verification email.',
        });
      }
    });
  }

  const diffAccountLink = document.getElementById('use-different-account');
  if (diffAccountLink) {
    diffAccountLink.addEventListener('click', async (e) => {
      e.preventDefault();
      await authClient.signOut();
      navigateTo('/sign-in');
    });
  }
}

function startCooldownTimer(seconds: number, email: string): void {
  let remaining = seconds;
  const timer = setInterval(() => {
    remaining -= 1;
    const btn = document.getElementById('btn-resend-verification') as HTMLButtonElement | null;
    if (btn) {
      if (remaining > 0) {
        btn.textContent = `Resend email (${remaining}s)`;
        btn.disabled = true;
      } else {
        btn.textContent = 'Resend email';
        btn.disabled = false;
        clearInterval(timer);
      }
    } else {
      clearInterval(timer);
    }
  }, 1000);
}

function attachForgotPasswordListeners(): void {
  const form = document.getElementById('forgot-password-form') as HTMLFormElement | null;
  const errorEl = document.getElementById('forgot-error');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (form.elements.namedItem('email') as HTMLInputElement).value;
      const submitBtn = document.getElementById('submit-forgot-password') as HTMLButtonElement | null;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending reset link…';
      }

      try {
        await authClient.forgotPassword(email);
        appEl.innerHTML = renderForgotPasswordPage({ isSubmitted: true });
      } catch (err: any) {
        if (errorEl) {
          errorEl.className = 'form-error mb-4 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${err.message || 'Unable to process request.'}</span>`;
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Send reset link';
        }
      }
    });
  }
}

function attachResetPasswordListeners(): void {
  const form = document.getElementById('reset-password-form') as HTMLFormElement | null;
  const errorEl = document.getElementById('reset-error');
  const toggleBtn = document.getElementById('toggle-reset-passwords');
  const pass1 = document.getElementById('password') as HTMLInputElement | null;
  const pass2 = document.getElementById('confirmPassword') as HTMLInputElement | null;

  if (toggleBtn && pass1 && pass2) {
    toggleBtn.addEventListener('click', () => {
      const isPass = pass1.type === 'password';
      pass1.type = isPass ? 'text' : 'password';
      pass2.type = isPass ? 'text' : 'password';
      toggleBtn.textContent = isPass ? 'Hide passwords' : 'Show passwords';
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const token = (form.elements.namedItem('token') as HTMLInputElement).value;
      const password = (form.elements.namedItem('newPassword') as HTMLInputElement)?.value || (form.elements.namedItem('password') as HTMLInputElement)?.value;
      const confirmPassword = (form.elements.namedItem('confirmNewPassword') as HTMLInputElement)?.value || (form.elements.namedItem('confirmPassword') as HTMLInputElement)?.value;
      const submitBtn = document.getElementById('submit-reset-password') as HTMLButtonElement | null;

      if (password !== confirmPassword) {
        if (errorEl) {
          errorEl.className = 'form-error mb-4 p-3 border border-danger rounded';
          errorEl.innerHTML = '<span aria-hidden="true">⚠</span> <span>Passwords do not match.</span>';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating password…';
      }

      try {
        await authClient.resetPassword(token, password);
        appEl.innerHTML = renderResetPasswordPage({ isSuccess: true });
      } catch (err: any) {
        if (errorEl) {
          errorEl.className = 'form-error mb-4 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${err.message || 'Reset link expired or invalid.'}</span>`;
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Update password';
        }
      }
    });
  }
}

function attachProfileListeners(): void {
  const form = document.getElementById('profile-settings-form') as HTMLFormElement | null;
  const saveBtn = document.getElementById('btn-save-profile') as HTMLButtonElement | null;
  const errorEl = document.getElementById('profile-error');

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const displayName = (form.elements.namedItem('displayName') as HTMLInputElement).value;

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
      }

      try {
        const updated = await authClient.updateProfile(displayName);
        appEl.innerHTML = renderAppShell({
          activePath: '/settings/profile',
          user: updated,
          headerTitle: 'Profile settings',
          content: renderProfileSettingsPage({
            user: updated,
            successMessage: 'Profile display name updated successfully.',
          }),
        });
        attachProfileListeners();
      } catch (err: any) {
        if (errorEl) {
          errorEl.className = 'form-error mb-6 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${err.message || 'Failed to update profile.'}</span>`;
        }
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save changes';
        }
      }
    });
  }
}

function attachAppearanceListeners(): void {
  const form = document.getElementById('appearance-settings-form') as HTMLFormElement | null;
  const radioInputs = document.querySelectorAll<HTMLInputElement>('input[name="theme"]');

  radioInputs.forEach((radio) => {
    radio.addEventListener('change', () => {
      const selected = radio.value as 'dark' | 'light' | 'system';
      applyTheme(selected);
    });
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const themeRadio = form.querySelector<HTMLInputElement>('input[name="theme"]:checked');
      const theme = (themeRadio?.value || 'system') as 'dark' | 'light' | 'system';
      const fontSize = Number((form.elements.namedItem('editorFontSize') as HTMLSelectElement).value);
      const indent = Number((form.elements.namedItem('indentationSpaces') as HTMLSelectElement).value);
      const saveBtn = document.getElementById('btn-save-appearance') as HTMLButtonElement | null;

      if (saveBtn) {
        saveBtn.disabled = true;
        saveBtn.textContent = 'Saving…';
      }

      try {
        const updated = await authClient.saveAppearance({
          theme,
          editorFontSize: fontSize,
          indentationSpaces: indent,
        });

        const user = authClient.getUser()!;
        const resolvedSystem = window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';

        appEl.innerHTML = renderAppShell({
          activePath: '/settings/appearance',
          user,
          headerTitle: 'Appearance settings',
          content: renderAppearanceSettingsPage({
            preferences: updated,
            resolvedSystemTheme: resolvedSystem,
            successMessage: 'Appearance preferences saved.',
          }),
        });
        attachAppearanceListeners();
      } catch (err: any) {
        const errorEl = document.getElementById('appearance-error');
        if (errorEl) {
          errorEl.className = 'form-error mb-6 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${err.message || 'Failed to save appearance settings.'}</span>`;
        }
        if (saveBtn) {
          saveBtn.disabled = false;
          saveBtn.textContent = 'Save preferences';
        }
      }
    });
  }
}

function attachSecurityListeners(): void {
  const form = document.getElementById('change-password-form') as HTMLFormElement | null;
  const errorEl = document.getElementById('security-error');
  const btnSignoutAll = document.getElementById('btn-sign-out-all');
  const modal = document.getElementById('sign-out-all-modal');
  const btnCancelSignout = document.getElementById('btn-cancel-signout-all');
  const btnConfirmSignout = document.getElementById('btn-confirm-signout-all');

  if (btnSignoutAll && modal) {
    btnSignoutAll.addEventListener('click', () => {
      modal.style.display = 'flex';
    });
  }

  if (btnCancelSignout && modal) {
    btnCancelSignout.addEventListener('click', () => {
      modal.style.display = 'none';
    });
  }

  if (btnConfirmSignout) {
    btnConfirmSignout.addEventListener('click', async () => {
      await authClient.signOutAll();
      navigateTo('/sign-in');
    });
  }

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const currentPassword = (form.elements.namedItem('currentPassword') as HTMLInputElement).value;
      const newPassword = (form.elements.namedItem('newPassword') as HTMLInputElement).value;
      const confirmNewPassword = (form.elements.namedItem('confirmNewPassword') as HTMLInputElement).value;
      const submitBtn = document.getElementById('btn-change-password') as HTMLButtonElement | null;

      if (newPassword !== confirmNewPassword) {
        if (errorEl) {
          errorEl.className = 'form-error mb-6 p-3 border border-danger rounded';
          errorEl.innerHTML = '<span aria-hidden="true">⚠</span> <span>New passwords do not match.</span>';
        }
        return;
      }

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Updating…';
      }

      try {
        await authClient.changePassword(currentPassword, newPassword);
        const user = authClient.getUser()!;
        appEl.innerHTML = renderAppShell({
          activePath: '/settings/security',
          user,
          headerTitle: 'Security settings',
          content: renderSecuritySettingsPage({
            user,
            successMessage: 'Password updated successfully.',
          }),
        });
        attachSecurityListeners();
      } catch (err: any) {
        if (errorEl) {
          errorEl.className = 'form-error mb-6 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${err.message || 'Failed to update password.'}</span>`;
        }
        if (submitBtn) {
          submitBtn.disabled = false;
          submitBtn.textContent = 'Update password';
        }
      }
    });
  }
}

function attachPrivacyListeners(): void {
  const exportForm = document.getElementById('export-data-form');
  const btnOpenDeleteModal = document.getElementById('btn-open-delete-modal');
  const deleteModal = document.getElementById('delete-account-modal');
  const btnCancelDelete = document.getElementById('btn-cancel-deletion');
  const btnConfirmDelete = document.getElementById('btn-confirm-deletion') as HTMLButtonElement | null;
  const ackCheckbox = document.getElementById('acknowledge-deletion-consequences') as HTMLInputElement | null;

  if (ackCheckbox && btnConfirmDelete) {
    ackCheckbox.addEventListener('change', () => {
      btnConfirmDelete.disabled = !ackCheckbox.checked;
    });
  }

  if (btnOpenDeleteModal && deleteModal) {
    btnOpenDeleteModal.addEventListener('click', () => {
      deleteModal.style.display = 'flex';
    });
  }

  if (btnCancelDelete && deleteModal) {
    btnCancelDelete.addEventListener('click', () => {
      deleteModal.style.display = 'none';
    });
  }

  if (btnConfirmDelete) {
    btnConfirmDelete.addEventListener('click', async () => {
      btnConfirmDelete.disabled = true;
      btnConfirmDelete.textContent = 'Deleting account…';

      try {
        await authClient.requestAccountDeletion(true);
        navigateTo('/sign-in');
      } catch (err: any) {
        const errorEl = document.getElementById('privacy-error');
        if (deleteModal) deleteModal.style.display = 'none';
        if (errorEl) {
          errorEl.className = 'form-error mb-6 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${err.message || 'Deletion request blocked.'}</span>`;
        }
      }
    });
  }

  if (exportForm) {
    exportForm.addEventListener('submit', async (e) => {
      e.preventDefault();
      const exportBtn = document.getElementById('btn-export-data') as HTMLButtonElement | null;
      if (exportBtn) {
        exportBtn.disabled = true;
        exportBtn.textContent = 'Packaging data…';
      }

      try {
        const result = await authClient.requestDataExport();
        const user = authClient.getUser()!;
        appEl.innerHTML = renderAppShell({
          activePath: '/settings/privacy',
          user,
          headerTitle: 'Privacy and account requests',
          content: renderPrivacySettingsPage({
            exportData: result.exportPayload,
            successMessage: 'Data export package generated.',
          }),
        });
        attachPrivacyListeners();
      } catch (err: any) {
        const errorEl = document.getElementById('privacy-error');
        if (errorEl) {
          errorEl.className = 'form-error mb-6 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${err.message || 'Export failed.'}</span>`;
        }
        if (exportBtn) {
          exportBtn.disabled = false;
          exportBtn.textContent = 'Export my data';
        }
      }
    });
  }
}

// Global click handler for internal SPA navigation
document.addEventListener('click', (e) => {
  const target = (e.target as HTMLElement).closest('a');
  if (target && target.href && !target.hasAttribute('download') && target.origin === window.location.origin) {
    const pathname = target.pathname;
    if (pathname.startsWith('/api/')) return; // Allow direct API endpoints

    e.preventDefault();
    navigateTo(pathname + target.search);
  }
});

window.addEventListener('popstate', () => {
  renderApp();
});

// Initial paint
renderApp();
