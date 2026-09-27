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
import { renderAgentActivityPage } from './pages/author/AgentActivityPage.ts';
import { renderSafeDenialPage } from './pages/status/SafeDenialPage.ts';
import { renderLandingPage } from './pages/public/LandingPage.ts';
import { renderCatalogPage, type CatalogPageProps } from './pages/public/CatalogPage.ts';
import { renderCourseOverviewPage, type CourseOverviewPageProps } from './pages/public/CourseOverviewPage.ts';
import { renderHelpPage, type HelpPageProps } from './pages/public/HelpPage.ts';
import { renderPolicyPage } from './pages/public/PolicyPage.ts';
import { renderStudentsAndInvitationsPage } from './pages/author/StudentsAndInvitationsPage.ts';
import { renderStudentDetailPage } from './pages/author/StudentDetailPage.ts';
import { renderCourseAnalyticsPage } from './pages/author/CourseAnalyticsPage.ts';
import { renderCoursePublishPage, type CoursePublishPageOptions } from './pages/author/CoursePublishPage.ts';
import { renderPythonWorkspacePage, renderPythonExecutionResults, type PythonWorkspacePageOptions } from './pages/learning/PythonWorkspacePage.ts';
import type { ExecutionResult } from 'zur-shared';
import { EditorState, Compartment } from '@codemirror/state';
import { EditorView, keymap, lineNumbers, highlightActiveLine, highlightActiveLineGutter } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap, indentWithTab } from '@codemirror/commands';
import { searchKeymap, highlightSelectionMatches } from '@codemirror/search';
import { bracketMatching, HighlightStyle, syntaxHighlighting, indentOnInput, indentUnit } from '@codemirror/language';
import { closeBrackets, closeBracketsKeymap } from '@codemirror/autocomplete';
import { python } from '@codemirror/lang-python';
import { tags } from '@lezer/highlight';
import { renderAttemptHistoryPage } from './pages/learning/AttemptHistoryPage.ts';
import { DraftManager } from './services/draft-manager.ts';
import { DraftSaveQueue } from './services/draft-save-queue.ts';
import { renderAdminPage } from './pages/admin/AdminPages.ts';
import { CourseClient } from './services/course-client.ts';
import { renderTheoryStepPage } from './pages/learning/TheoryStepPage.ts';
import { renderVideoStepPage } from './pages/learning/VideoStepPage.ts';
import { renderQuizStepPage } from './pages/learning/QuizStepPage.ts';
import { renderAuthorCoursesPage } from './pages/author/AuthorCoursesPage.ts';
import { renderCourseBuilderPage } from './pages/author/CourseBuilderPage.ts';
import { renderTheoryEditorPage } from './pages/author/TheoryEditorPage.ts';
import { renderVideoEditorPage } from './pages/author/VideoEditorPage.ts';
import { renderQuizEditorPage } from './pages/author/QuizEditorPage.ts';
import { renderPythonExerciseEditorPage } from './pages/author/PythonExerciseEditorPage.ts';
import { renderCourseSettingsPage } from './pages/author/CourseSettingsPage.ts';
import { renderAuthorPreviewPage } from './pages/author/AuthorPreviewPage.ts';
import { renderDashboardContinuePage } from './pages/learning/DashboardContinuePage.ts';
import { renderMyCoursesPage } from './pages/learning/MyCoursesPage.ts';
import { renderEnrolledCoursePage } from './pages/learning/EnrolledCoursePage.ts';
import { renderAcceptInvitationPage } from './pages/learning/AcceptInvitationPage.ts';

const appEl = document.getElementById('app')!;
const authClient = AuthClient.getInstance();
const courseClient = CourseClient.getInstance();
async function s2Request(url: string, method = 'GET', body?: unknown): Promise<any> {
  const response = await fetch(url, { method, headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${authClient.getToken() || ''}` }, body: body === undefined ? undefined : JSON.stringify(body) });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error?.message || 'The request failed. Please try again.');
  return data;
}

function s2Current(path: string): boolean { return window.location.pathname + window.location.search === path; }

async function loadS2Page(pageId: string, params: Record<string, string>, path: string): Promise<void> {
  const user = authClient.getUser()!;
  const courseId = params.courseId;
  try {
    if (pageId === 'P21') {
      const data = await s2Request('/api/author/courses?limit=100');
      if (!s2Current(path)) return;
      let modal = false;
      const draw = (error?: string) => {
        appEl.innerHTML = renderAuthorCoursesPage({ user, courses: data.courses, showNewCourseModal: modal, newCourseError: error });
        appEl.querySelectorAll('[data-action="open-new-course-modal"]').forEach(el => el.addEventListener('click', () => { modal = true; draw(); }));
        appEl.querySelectorAll('[data-action="close-modal"]').forEach(el => el.addEventListener('click', () => { modal = false; draw(); }));
        appEl.querySelector('form.modal-body[action="/teach"]')?.addEventListener('submit', async event => {
          event.preventDefault();
          const title = String(new FormData(event.currentTarget as HTMLFormElement).get('title') || '').trim();
          try { const course = await s2Request('/api/author/courses', 'POST', { title }); window.history.pushState({}, '', `/teach/${course.id}/content`); renderApp(); }
          catch (err: any) { draw(err.message); }
        });
      };
      draw();
      return;
    }
    if (pageId === 'P09') {
      const data = await s2Request('/api/student/dashboard');
      if (s2Current(path)) appEl.innerHTML = renderDashboardContinuePage({ user, continueCourse: data.continueCourse, recentCourses: data.recentCourses });
      return;
    }
    if (pageId === 'P10') {
      const data = await s2Request('/api/student/courses');
      if (!s2Current(path)) return;
      const courses = data.enrollments.map((e: any) => ({ ...e, percentage: e.progress?.percentage || 0, completedRequired: e.progress?.completedRequired || 0, totalRequired: e.progress?.totalRequired || 0, isCompleted: Boolean(e.progress?.isCompleted), nextStepId: e.progress?.nextIncompleteStepId || e.progress?.lastVisitedStepId }));
      appEl.innerHTML = renderMyCoursesPage({ user, courses });
      return;
    }
    if (pageId === 'P11') {
      const progress = await s2Request(`/api/enrollments/${params.enrollmentId}/progress`);
      if (!s2Current(path)) return;
      const modules: any[] = [];
      for (const step of progress.steps) {
        let module = modules.find(m => m.id === step.moduleId);
        if (!module) { module = { id: step.moduleId, title: String(step.moduleTitle || '').replace(/^Module\s+\d+\s*:\s*/i, ''), lessons: [] }; modules.push(module); }
        let lesson = module.lessons.find((l: any) => l.id === step.lessonId);
        if (!lesson) { lesson = { id: step.lessonId, title: String(step.lessonTitle || '').replace(/^Lesson\s+\d+\s*:\s*/i, ''), steps: [] }; module.lessons.push(lesson); }
        lesson.steps.push(step);
      }
      const duration = Number(progress.estimatedDurationMinutes) || progress.steps.reduce((sum: number, step: any) => sum + (Number(step.estimatedDurationMinutes) || 0), 0);
      appEl.innerHTML = renderEnrolledCoursePage({ user, enrollmentId: params.enrollmentId, courseId: progress.courseId, title: progress.courseTitle, description: progress.description, difficulty: progress.difficulty, estimatedDurationMinutes: duration, pinnedVersionNumber: progress.pinnedVersionNumber, percentage: progress.percentage, completedRequired: progress.completedRequired, totalRequired: progress.totalRequired, waivedRequired: progress.waivedRequired, isCompleted: progress.isCompleted, nextStepId: progress.nextIncompleteStepId, modules });
      return;
    }
    if (!courseId) return;
    const course = await s2Request(`/api/author/courses/${courseId}`);
    if (!s2Current(path)) return;
    if (pageId === 'P31') {
      const categories = await s2Request('/api/categories');
      if (s2Current(path)) appEl.innerHTML = renderCourseSettingsPage({ course, categories });
      appEl.querySelectorAll('form.metadata-form, form.access-form').forEach(form => form.addEventListener('submit', async event => {
        event.preventDefault();
        const target = event.currentTarget as HTMLFormElement;
        const fields = Object.fromEntries(new FormData(target).entries()) as Record<string, string>;
        const metadata = target.classList.contains('metadata-form');
        if (metadata) { fields.tags = fields.tags || ''; fields.learningOutcomes = fields.learningOutcomes || ''; }
        try {
          await s2Request(`/api/author/courses/${courseId}/${metadata ? 'metadata' : 'settings'}`, 'PUT', metadata ? { expectedRevision: Number(fields.expectedRevision), metadata: { ...fields, tags: fields.tags.split(',').map(v => v.trim()).filter(Boolean), learningOutcomes: fields.learningOutcomes.split('\n').map(v => v.trim()).filter(Boolean), estimatedDurationMinutes: Number(fields.estimatedDurationMinutes) || 0 } } : fields);
          renderApp(path);
        } catch (err: any) { window.alert(err.message); }
      }));
      return;
    }
    const tree = await s2Request(`/api/author/courses/${courseId}/structure`);
    if (!s2Current(path)) return;
    if (pageId === 'P22') {
      const query = new URLSearchParams(window.location.search);
      let remoteUpdate: any;
      try {
        const actRes = await s2Request(`/api/author/courses/${courseId}/activity?limit=1`);
        const latest = actRes?.items?.[0];
        const createdAt = latest?.createdAt || latest?.created_at;
        if (latest && createdAt && (Date.now() - new Date(createdAt).getTime() < 3600 * 1000)) {
          const hasLocalEdits = Boolean(sessionStorage.getItem(`zur_builder_unsaved_${courseId}`) || query.get('hasLocalEdits') === 'true');
          remoteUpdate = {
            agentName: latest.tokenLabel || latest.client_label || 'AI agent',
            timestampText: 'just now',
            newRevision: latest.newRevision ?? latest.new_revision,
            hasLocalEdits,
          };
        }
      } catch { /* activity optional */ }

      appEl.innerHTML = renderCourseBuilderPage({ courseId, courseTitle: course.title, publicationState: course.publicationStatus, hasUnpublishedChanges: course.hasUnpublishedChanges, modules: tree.modules, selectedType: (query.get('type') as any) || 'course', selectedId: query.get('id') || courseId, remoteUpdate });
      document.getElementById('load-update-btn')?.addEventListener('click', () => {
        sessionStorage.removeItem(`zur_builder_unsaved_${courseId}`);
        renderApp(path);
      });
      document.getElementById('resolve-conflict-btn')?.addEventListener('click', () => {
        window.history.pushState({}, '', `/teach/${courseId}/activity`);
        renderApp();
      });
      appEl.querySelectorAll('form[action^="/teach/"]').forEach(form => form.addEventListener('submit', async event => {
        event.preventDefault();
        const target = event.currentTarget as HTMLFormElement;
        const fields = Object.fromEntries(new FormData(target).entries());
        const action = target.getAttribute('action') || '';
        let route = action.replace(/^\/teach/, '/api/author/courses');
        if (route.endsWith('/rename')) route = route.slice(0, -7);
        if (route.endsWith('/duplicate')) route = route.slice(0, -10) + '/duplicate';
        try { await s2Request(route, action.endsWith('/rename') ? 'PUT' : 'POST', fields); renderApp(path); }
        catch (err: any) { showRouteFailure(err.message, path); }
      }));
      return;
    }
    if (pageId === 'P26') {
      const steps = tree.modules.flatMap((m: any) => m.lessons.flatMap((l: any) => l.steps));
      const requested = new URLSearchParams(window.location.search).get('stepId');
      const step = steps.find((s: any) => s.id === requested) || steps[0];
      if (!step) { showRouteFailure('Add a step before previewing the course.', path); return; }
      const preview = await s2Request(`/api/author/courses/${courseId}/preview/${step.id}`);
      if (!s2Current(path)) return;
      appEl.innerHTML = renderAuthorPreviewPage({ ...preview, returnEditorUrl: `/teach/${courseId}/content/${step.type}/${step.id}` });
      return;
    }
    if (['P23', 'P24', 'P25'].includes(pageId)) {
      const step = tree.modules.flatMap((m: any) => m.lessons.flatMap((l: any) => l.steps)).find((s: any) => s.id === params.stepId);
      if (!step) throw new Error("This step isn't available.");
      const detail = await s2Request(`/api/author/steps/${step.id}/content`);
      const specialized = step.type === 'quiz' ? await s2Request(`/api/author/steps/${step.id}/quiz`) : step.type === 'python' ? await s2Request(`/api/author/steps/${step.id}/python`) : null;
      if (!s2Current(path)) return;
      const base = { courseId, courseTitle: course.title, publicationState: course.publicationStatus, hasUnpublishedChanges: course.hasUnpublishedChanges, stepId: step.id, stepTitle: detail.title, revision: detail.revision, isRequired: detail.isRequired, estimatedDurationMinutes: detail.estimatedDurationMinutes };
      const c = specialized ? (step.type === 'quiz' ? specialized.quiz : specialized) : detail.content || {};
      if (step.type === 'theory') {
        appEl.innerHTML = renderTheoryEditorPage({ ...base, markdown: c.markdown || '' });
        appEl.querySelectorAll<HTMLElement>('.theory-tabs [data-tab]').forEach(button => button.addEventListener('click', () => {
          const tab = button.dataset.tab;
          const isPreview = tab === 'preview';
          (appEl.querySelector('.theory-edit-pane') as HTMLElement)?.style.setProperty('display', isPreview ? 'none' : '');
          (appEl.querySelector('.theory-preview-pane') as HTMLElement)?.style.setProperty('display', isPreview ? '' : 'none');
          appEl.querySelectorAll<HTMLElement>('.theory-tabs [data-tab]').forEach(b => {
            b.classList.toggle('active', b === button);
            b.setAttribute('aria-selected', String(b === button));
          });
        }));
      }
      else if (step.type === 'video') appEl.innerHTML = renderVideoEditorPage({ ...base, videoUrl: c.videoUrl || '', provider: c.provider || 'youtube', transcript: c.transcript || '', captionVerified: Boolean(c.captionVerified) });
      else if (step.type === 'quiz') appEl.innerHTML = renderQuizEditorPage({ ...base, quizType: c.quizType || 'single_choice', prompt: c.prompt || '', options: c.options || [], explanation: c.explanation || '' });
      else appEl.innerHTML = renderPythonExerciseEditorPage({ ...base, problemStatement: c.problemStatement || '', inputFormat: c.inputFormat || '', outputFormat: c.outputFormat || '', constraints: c.constraints || '', starterCode: c.starterCode || '', referenceSolution: c.referenceSolution || '', hints: c.hints || [], solutionExplanation: c.solutionExplanation || '', publicTests: c.publicTests || [], hiddenTests: c.hiddenTests || [], runtimeLimits: c.runtimeLimits || { cpuTimeoutSeconds: 2, wallTimeoutSeconds: 5, memoryLimitMib: 128 } });
      if (step.type === 'quiz') {
        appEl.querySelector('[data-action="add-option"]')?.addEventListener('click', () => {
          const container = appEl.querySelector('.options-container');
          if (!container || container.children.length >= 8) return;
          const id = crypto.randomUUID();
          const row = document.createElement('div'); row.className = 'quiz-option-row card p-3 mb-2'; row.dataset.optionId = id;
          row.innerHTML = `<label class="correct-answer-label"><input type="${(appEl.querySelector('#quiz-type-select') as HTMLSelectElement)?.value === 'multiple_choice' ? 'checkbox' : 'radio'}" name="correctOption" value="${id}"> Correct answer</label><input type="text" class="text-input option-text-input" placeholder="Answer choice" required><button type="button" class="btn btn-secondary btn-compact remove-option-btn">Remove</button>`;
          container.append(row);
        });
        appEl.querySelector('.options-container')?.addEventListener('click', event => {
          const button = (event.target as Element).closest('.remove-option-btn');
          if (button && appEl.querySelectorAll('.quiz-option-row').length > 2) button.closest('.quiz-option-row')?.remove();
        });
        appEl.querySelector('#quiz-type-select')?.addEventListener('change', () => {
          const multi = (appEl.querySelector('#quiz-type-select') as HTMLSelectElement).value === 'multiple_choice';
          appEl.querySelectorAll<HTMLInputElement>('.quiz-option-row input[type="radio"], .quiz-option-row input[type="checkbox"]').forEach(input => { input.type = multi ? 'checkbox' : 'radio'; input.name = multi ? `correctOption_${input.value}` : 'correctOption'; });
        });
      }
      if (step.type === 'python') {
        appEl.querySelectorAll<HTMLElement>('.sub-tab-btn[data-tab]').forEach(button => button.addEventListener('click', () => {
          const tab = button.dataset.tab;
          appEl.querySelectorAll<HTMLElement>('.sub-tab-pane').forEach(pane => { pane.style.display = pane.id === `tab-${tab}` ? '' : 'none'; });
          appEl.querySelectorAll<HTMLElement>('.sub-tab-btn').forEach(item => { item.classList.toggle('active', item === button); item.setAttribute('aria-selected', String(item === button)); });
        }));
        for (const kind of ['public', 'hidden']) appEl.querySelector(`[data-action="add-${kind}-test"]`)?.addEventListener('click', event => {
          const section = (event.currentTarget as Element).closest('.test-cases-section');
          if (!section) return;
          const row = document.createElement('div'); row.className = 'card p-3 mb-2 test-case-card';
          row.innerHTML = `<div class="test-header"><strong>${kind === 'public' ? 'Public' : 'Hidden'} test</strong></div><label class="field-label">Standard input<textarea class="textarea-input code-editor font-mono test-stdin" rows="3"></textarea></label><label class="field-label">Expected output<textarea class="textarea-input code-editor font-mono test-stdout" rows="3"></textarea></label><button type="button" class="btn btn-secondary btn-compact remove-test">Remove</button>`;
          section.insertBefore(row, event.currentTarget as Node);
        });
        appEl.querySelector('#tab-tests')?.addEventListener('click', event => { if ((event.target as Element).classList.contains('remove-test')) (event.target as Element).closest('.test-case-card')?.remove(); });
      }
      const saveButton = document.createElement('button');
      saveButton.type = 'button'; saveButton.className = 'btn btn-primary btn-compact'; saveButton.textContent = 'Save changes';
      appEl.querySelector('.author-header-right')?.prepend(saveButton);
      saveButton.addEventListener('click', async () => {
        const value = (id: string) => (appEl.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement | null)?.value || '';
        const checked = (id: string) => Boolean((appEl.querySelector(`#${id}`) as HTMLInputElement | null)?.checked);
        const stepMeta = { title: value('step-title-input'), isRequired: checked('step-required'), estimatedDurationMinutes: Number(value('step-duration')) || detail.estimatedDurationMinutes };
        let payload: any = { ...c, kind: step.type };
        if (step.type === 'theory') payload.markdown = value('theory-markdown-input');
        if (step.type === 'video') payload = { ...payload, videoUrl: value('video-url-input'), transcript: value('video-transcript-input'), captionVerified: checked('caption-verified'), provider: value('video-url-input').includes('vimeo.com') ? 'vimeo' : 'youtube' };
        if (step.type === 'quiz') {
          payload = { ...payload, quizType: value('quiz-type-select'), prompt: value('quiz-prompt-input'), explanation: value('quiz-explanation-input'), options: Array.from(appEl.querySelectorAll('.quiz-option-row')).map(row => ({ id: (row as HTMLElement).dataset.optionId, text: (row.querySelector('input[type="text"]') as HTMLInputElement)?.value || '', isCorrect: Boolean((row.querySelector('input[type="radio"], input[type="checkbox"]') as HTMLInputElement)?.checked) })) };
        }
        if (step.type === 'python') {
          const sections = appEl.querySelectorAll('#tab-tests .test-cases-section');
          const readTests = (section: Element | undefined) => Array.from(section?.querySelectorAll('.test-case-card') || []).map(row => ({ stdin: (row.querySelector('.test-stdin') as HTMLTextAreaElement).value, expectedStdout: (row.querySelector('.test-stdout') as HTMLTextAreaElement).value }));
          payload = { ...payload, problemStatement: value('problem-stmt-input'), inputFormat: value('input-format-input'), outputFormat: value('output-format-input'), constraints: value('constraints-input'), starterCode: value('starter-code-input'), referenceSolution: value('ref-solution-input'), solutionExplanation: value('explanation-input'), publicTests: readTests(sections[0]), hiddenTests: readTests(sections[1]), runtimeLimits: { cpuTimeoutSeconds: Number(value('cpu-timeout')), wallTimeoutSeconds: Number(value('wall-timeout')), memoryLimitMib: Number(value('memory-limit')) } };
        }
        saveButton.disabled = true; saveButton.textContent = 'Saving…';
        try {
          const endpoint = step.type === 'quiz' ? `/api/author/steps/${step.id}/quiz` : step.type === 'python' ? `/api/author/steps/${step.id}/python` : `/api/author/steps/${step.id}/content`;
          const body = step.type === 'quiz' ? { expectedRevision: detail.revision, quiz: payload } : step.type === 'python' ? { expectedRevision: detail.revision, exercise: { ...payload, title: stepMeta.title } } : { expectedRevision: detail.revision, payload, stepMeta };
          const result = await s2Request(endpoint, 'PUT', body);
          detail.revision = result.revision; Object.assign(c, payload); saveButton.textContent = 'Saved';
        } catch (err: any) { saveButton.textContent = 'Retry save'; window.alert(err.message); }
        finally { saveButton.disabled = false; }
      });
      return;
    }
  } catch (err: any) { if (s2Current(path)) showRouteFailure(err.message || 'Could not load this page.', path); }
}

async function loadInvitationPage(inviteToken: string, path: string): Promise<void> {
  try {
    const preview = await s2Request(`/api/invitations/${encodeURIComponent(inviteToken)}`);
    if (!s2Current(path)) return;
    const show = (error?: string) => {
      appEl.innerHTML = renderAcceptInvitationPage({ token: inviteToken, valid: preview.valid, reason: preview.reason, courseTitle: preview.course?.title, courseDescription: preview.course?.description, inviterName: preview.inviterName, expiresAt: preview.expiresAt, recipientEmailMasked: preview.recipientEmailMasked, currentUser: authClient.getUser(), error });
      appEl.querySelector('.invitation-accept-form')?.addEventListener('submit', async event => {
        event.preventDefault();
        try { const accepted = await s2Request(`/api/invitations/${encodeURIComponent(inviteToken)}/accept`, 'POST'); window.history.pushState({}, '', `/learn/${accepted.enrollment.id}`); renderApp(); }
        catch (err: any) { show(err.message); }
      });
    };
    show();
  } catch { if (s2Current(path)) appEl.innerHTML = renderAcceptInvitationPage({ token: inviteToken, valid: false }); }
}
const lessonMediaObjectUrls = new Set<string>();
let lessonVideoLoadTimer: number | undefined;
let lessonVideoReadyCleanup: (() => void) | undefined;

function releaseLessonMediaObjectUrls(): void {
  for (const url of lessonMediaObjectUrls) URL.revokeObjectURL(url);
  lessonMediaObjectUrls.clear();
  if (lessonVideoLoadTimer) window.clearTimeout(lessonVideoLoadTimer);
  lessonVideoLoadTimer = undefined;
  lessonVideoReadyCleanup?.();
  lessonVideoReadyCleanup = undefined;
}

export function applyTheme(theme: 'dark' | 'light' | 'system'): void {
  localStorage.setItem('zur_theme_preference', theme);
  let resolved: 'dark' | 'light' = theme === 'system'
    ? (window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark')
    : theme;

  document.documentElement.setAttribute('data-theme', resolved);
  document.documentElement.style.colorScheme = resolved;
}

function initTheme(): void {
  const savedTheme = (localStorage.getItem('zur_theme_preference') as 'dark' | 'light' | 'system') || 'dark';
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

let activeCatalogRequestId = 0;
let workspaceResizeController: AbortController | null = null;

function showRouteLoading(label: string): void {
  appEl.innerHTML = `<main class="container py-8" aria-busy="true"><h1 class="page-title">${label}</h1><p class="text-secondary" role="status">Loading from your account…</p></main>`;
}

function showRouteFailure(message: string, retryPath: string): void {
  appEl.innerHTML = `<main class="container py-8"><section class="state-container" role="alert"><h1 class="page-title">Couldn't load this page</h1><p class="text-secondary">${escapeHtml(message)}</p><button class="btn btn-secondary" id="route-retry">Try again</button></section></main>`;
  document.getElementById('route-retry')?.addEventListener('click', () => renderApp(retryPath));
}

async function renderAiConnectionsSettings(path: string, user: NonNullable<ReturnType<typeof authClient.getUser>>, state: { showCreateModal?: boolean; revealedToken?: any; revokingToken?: any; error?: string; successMessage?: string } = {}): Promise<void> {
  if (!user.capabilities.includes('author')) {
    appEl.innerHTML = renderAppShell({ activePath: path.split('?')[0], user, headerTitle: 'AI connections', content: renderAiConnectionsPage({ user, tokens: [] }) });
    return;
  }
  try {
    const response = await authClient.fetchApi(`/api/author/tokens?status=${encodeURIComponent(new URLSearchParams(path.split('?')[1] || '').get('filter') || 'all')}`);
    const tokens = response.tokens || [];
    const render = () => {
      appEl.innerHTML = renderAppShell({ activePath: path.split('?')[0], user, headerTitle: 'AI connections', content: renderAiConnectionsPage({ user, tokens, activeFilter: (new URLSearchParams(path.split('?')[1] || '').get('filter') || 'all') as any, ...state }) });
      const createButton = document.getElementById('btn-open-create-token') || document.getElementById('btn-empty-create-token');
      createButton?.addEventListener('click', () => { state = { showCreateModal: true }; render(); });
      document.querySelectorAll<HTMLElement>('[data-dialog-action="cancel"]').forEach((button) => button.addEventListener('click', () => { state = {}; render(); }));
      const createForm = document.getElementById('create-token-form') as HTMLFormElement | null;
      createForm?.addEventListener('submit', (event) => {
        event.preventDefault();
        void (async () => {
          const form = new FormData(createForm);
          const allScopes = [...createForm.querySelectorAll<HTMLInputElement>('input[name="scopes"]')];
          const preset = String(form.get('preset'));
          const presetScopes: Record<string, string[]> = {
            draft_authoring: ['courses:read', 'courses:create', 'content:write', 'media:write', 'exercises:validate'],
            read_only: ['courses:read'],
            full_course_control: ['courses:read', 'courses:create', 'content:write', 'media:write', 'exercises:validate', 'content:delete', 'courses:publish', 'courses:manage'],
          };
          const scopes = preset === 'custom' ? allScopes.filter((input) => input.checked).map((input) => input.value) : (presetScopes[preset] || []);
          const courseRestrictions = form.get('courseScopeType') === 'selected' ? [...createForm.querySelectorAll<HTMLInputElement>('input[name="selectedCourses"]:checked')].map((input) => input.value) : null;
          try {
            const created = await authClient.fetchApi('/api/author/tokens', { method: 'POST', body: JSON.stringify({ label: form.get('label'), password: form.get('password'), scopes, courseRestrictions, expiryDays: Number(form.get('expiryDays')) }) });
            state = { revealedToken: { id: created.token.id, rawToken: created.rawToken, label: created.token.label, scopes: created.token.scopes, courseRestrictions: created.token.courseRestrictions, expiresAt: created.token.expiresAt } };
            await renderAiConnectionsSettings(path, user, state);
          } catch (error: any) {
            state = { showCreateModal: true, error: error.message || 'The token could not be created.' };
            await renderAiConnectionsSettings(path, user, state);
          }
        })();
      });
      document.querySelectorAll<HTMLButtonElement>('[data-action="revoke-token"]').forEach((button) => button.addEventListener('click', () => {
        state = { revokingToken: tokens.find((item: any) => item.id === button.dataset.tokenId) };
        render();
      }));
      document.getElementById('btn-confirm-revoke')?.addEventListener('click', (event) => {
        const button = event.currentTarget as HTMLButtonElement;
        void authClient.fetchApi(`/api/author/tokens/${encodeURIComponent(button.dataset.tokenId || '')}`, { method: 'DELETE' })
          .then(() => renderAiConnectionsSettings(path, user, { successMessage: 'Connection revoked.' }))
          .catch((error: any) => renderAiConnectionsSettings(path, user, { error: error.message || 'The connection could not be revoked.' }));
      });
      document.getElementById('btn-toggle-secret-visibility')?.addEventListener('click', (event) => {
        const input = document.getElementById('revealed-token-value') as HTMLInputElement | null;
        const button = event.currentTarget as HTMLButtonElement;
        if (!input) return;
        input.type = input.type === 'password' ? 'text' : 'password';
        button.textContent = input.type === 'password' ? 'Reveal' : 'Hide';
      });
      document.getElementById('btn-copy-token')?.addEventListener('click', () => {
        const input = document.getElementById('revealed-token-value') as HTMLInputElement | null;
        const announcement = document.getElementById('copy-announcement');
        if (!input || !navigator.clipboard?.writeText) { if (announcement) announcement.textContent = 'Clipboard access is unavailable. Select and copy the token manually.'; return; }
        void navigator.clipboard.writeText(input.value).then(() => { if (announcement) announcement.textContent = 'Token copied. Store it in a secure client configuration.'; });
      });
    };
    render();
  } catch (error: any) {
    showRouteFailure(error.message || 'Could not load AI connections.', path);
  }
}

async function loadPythonWorkspace(enrollmentId: string, stepId: string, requestedPath: string): Promise<void> {
  const isCurrent = () => window.location.pathname + window.location.search === requestedPath;
  showRouteLoading('Python workspace');
  try {
    const [stepData, contentData, accountData] = await Promise.all([
      authClient.fetchApi(`/api/enrollments/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}`),
      authClient.fetchApi(`/api/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}/content`),
      authClient.fetchApi('/api/auth/me'),
    ]);
    if (!isCurrent()) return;
    const content = contentData.content;
    if (stepData.step?.type !== 'python' || content?.kind !== 'python') {
      appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
      return;
    }
    const draft = await authClient.fetchApi(`/api/drafts?enrollmentId=${encodeURIComponent(enrollmentId)}&stepId=${encodeURIComponent(stepId)}`);
    if (!isCurrent()) return;
    const user = authClient.getUser();
    if (!user) { appEl.innerHTML = renderSafeDenialPage({ type: 'access-denied' }); return; }
    const localDraft = DraftManager.loadLocalDraft(user.id, enrollmentId, stepId);
    const hasRecoveredLocal = Boolean(localDraft && localDraft.code !== draft.code && localDraft.revision === draft.revision);
    const hasRevisionConflict = Boolean(localDraft && localDraft.code !== draft.code && localDraft.revision !== draft.revision);
    const initialCode = hasRecoveredLocal || hasRevisionConflict ? localDraft!.code : draft.code;
    const pageOptions: PythonWorkspacePageOptions = {
      courseTitle: stepData.courseTitle,
      courseOverviewUrl: `/learn/${encodeURIComponent(enrollmentId)}`,
      lessonTitle: stepData.stepMeta?.lessonTitle || 'Lesson',
      stepTitle: stepData.step.title,
      stepOrdinalText: `Step ${Number(stepData.step.position) + 1}`,
      enrollmentId,
      stepId,
      problemStatement: content.problemStatement,
      inputFormat: content.inputFormat,
      outputFormat: content.outputFormat,
      constraints: content.constraints,
      starterCode: content.starterCode,
      currentCode: initialCode,
      editorFontSize: accountData.preferences?.editorFontSize,
      indentationSpaces: accountData.preferences?.indentationSpaces,
      isCompact: window.innerWidth < 1024,
      hints: content.hints || [],
      solutionExplanation: content.solutionExplanation,
      isCompleted: Boolean(stepData.stepMeta?.isCompleted),
      currentResult: null,
      saveStatus: hasRevisionConflict ? 'conflict' : hasRecoveredLocal ? 'unsaved' : 'saved',
      previousStepUrl: stepData.previousStepId ? `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepData.previousStepId)}` : null,
      nextStepUrl: stepData.nextStepId ? `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepData.nextStepId)}` : `/learn/${encodeURIComponent(enrollmentId)}`,
    };
    if (hasRevisionConflict) {
      pageOptions.saveNotice = 'A newer server draft exists. Your local copy is preserved on this device; reload the saved version before editing further.';
    } else if (hasRecoveredLocal) {
      pageOptions.saveNotice = 'Recovered unsynchronized code from this device. Syncing it now.';
    }
    const render = (overrides: Partial<PythonWorkspacePageOptions> = {}) => {
      appEl.innerHTML = renderPythonWorkspacePage({ ...pageOptions, ...overrides });
      initTheme();
    };
    render();
    attachPythonWorkspaceListeners(pageOptions, draft.revision, user.id, hasRevisionConflict, requestedPath);
    if (hasRecoveredLocal) {
      void savePythonDraft(pageOptions.currentCode || '', draft.revision, enrollmentId, stepId).then((saved) => {
        if (!isCurrent()) return;
        pageOptions.currentCode = saved.code;
        DraftManager.saveLocalDraft(user.id, enrollmentId, stepId, saved.code, saved.revision);
        const indicator = document.getElementById('python-save-indicator');
        if (indicator) { indicator.className = 'save-indicator saved'; indicator.textContent = 'Saved'; }
        const notice = document.getElementById('python-save-notice'); notice?.remove();
      }).catch(() => {
        const indicator = document.getElementById('python-save-indicator');
        if (indicator) { indicator.className = 'save-indicator unsaved'; indicator.textContent = 'Unsaved edits (offline)'; }
      });
    }
  } catch (error: any) {
    if (!isCurrent()) return;
    if (error.statusCode === 404 || error.statusCode === 403) appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
    else showRouteFailure('We could not load the enrolled exercise. Retry when the service is available.', requestedPath);
  }
}

async function loadEnrolledStep(enrollmentId: string, stepId: string, requestedPath: string): Promise<void> {
  showRouteLoading('Learning step');
  try {
    const data = await authClient.fetchApi(`/api/enrollments/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}`);
    if (window.location.pathname + window.location.search !== requestedPath) return;
    if (data.step?.type === 'theory' || data.step?.type === 'video') {
      void loadLessonStep(enrollmentId, stepId, data.step.type, requestedPath);
    } else if (data.step?.type === 'python') {
      void loadPythonWorkspace(enrollmentId, stepId, requestedPath);
    } else if (data.step?.type === 'quiz') {
      renderEnrolledQuiz(data, enrollmentId, stepId, requestedPath);
    } else {
      appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
    }
  } catch (error: any) {
    if (window.location.pathname + window.location.search !== requestedPath) return;
    if (error.statusCode === 404 || error.statusCode === 403) appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
    else showRouteFailure('We could not load this lesson. Retry when the service is available.', requestedPath);
  }
}

function renderEnrolledQuiz(data: any, enrollmentId: string, stepId: string, requestedPath: string, selectedOptionIds: string[] = [], feedback: any = null): void {
  const progressSteps = data.progress?.steps || [];
  const content = data.step.content || {};
  appEl.innerHTML = renderQuizStepPage({
    courseTitle: data.courseTitle || 'Course',
    courseOverviewUrl: `/learn/${encodeURIComponent(enrollmentId)}`,
    lessonTitle: data.stepMeta?.lessonTitle || 'Lesson',
    stepTitle: data.step.title,
    stepOrdinalText: `Step ${Number(data.step.position) + 1}`,
    isRequired: Boolean(data.step.isRequired),
    estimatedDurationMinutes: Number(data.step.estimatedDurationMinutes || 1),
    quizType: content.quizType,
    prompt: content.prompt || '',
    options: (content.options || []).map((option: any) => ({ id: option.id, text: option.text })),
    enrollmentId, stepId,
    isCompleted: Boolean(data.stepMeta?.isCompleted) || Boolean(feedback?.isPassed),
    selectedOptionIds, feedback,
    outlineContent: renderLessonRail({ steps: progressSteps.map((step: any, index: number) => ({
      id: step.id, ordinal: index + 1, title: step.title, type: step.type,
      isCurrent: step.id === stepId, isCompleted: Boolean(step.isCompleted), isWaived: Boolean(step.isWaived), isRequired: Boolean(step.isRequired),
      href: `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(step.id)}`,
    })) }),
    previousStepUrl: data.previousStepId ? `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(data.previousStepId)}` : null,
    nextStepUrl: data.nextStepId ? `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(data.nextStepId)}` : null,
  });
  const form = appEl.querySelector<HTMLFormElement>('.quiz-form');
  form?.addEventListener('submit', (event) => {
    event.preventDefault();
    const selected = [...form.querySelectorAll<HTMLInputElement>('input[name="selectedOptionIds"]:checked')].map((input) => input.value);
    if (!selected.length) return;
    const button = form.querySelector<HTMLButtonElement>('button[type="submit"]');
    if (button) button.disabled = true;
    void authClient.fetchApi(`/api/steps/${encodeURIComponent(stepId)}/quiz/submit`, { method: 'POST', body: JSON.stringify({ enrollmentId, selectedOptionIds: selected }) })
      .then((result) => { if (window.location.pathname + window.location.search === requestedPath) renderEnrolledQuiz(data, enrollmentId, stepId, requestedPath, selected, result); })
      .catch(() => { if (button) button.disabled = false; const message = document.createElement('p'); message.setAttribute('role', 'alert'); message.textContent = 'Could not check your answer. Your selection is still here. Try again.'; form.prepend(message); });
  });
}

async function loadLessonStep(enrollmentId: string, stepId: string, kind: 'theory' | 'video', requestedPath: string): Promise<void> {
  const isCurrent = () => window.location.pathname + window.location.search === requestedPath;
  showRouteLoading(kind === 'video' ? 'Video lesson' : 'Theory lesson');
  try {
    const data = await authClient.fetchApi(`/api/enrollments/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}`);
    if (!isCurrent()) return;
    if (data.step?.type !== kind) {
      appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
      return;
    }
    const progressSteps = data.progress?.steps || [];
    const outlineContent = renderLessonRail({
      steps: progressSteps.map((step: any, index: number) => ({
        id: step.id, ordinal: index + 1, title: step.title, type: step.type,
        isCurrent: step.id === stepId, isCompleted: Boolean(step.isCompleted),
        isWaived: Boolean(step.isWaived), isRequired: Boolean(step.isRequired),
        href: `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(step.id)}`,
      })),
    });
    const common = {
      courseTitle: data.courseTitle || 'Course',
      courseOverviewUrl: `/learn/${encodeURIComponent(enrollmentId)}`,
      lessonTitle: data.stepMeta?.lessonTitle || progressSteps.find((s: any) => s.id === stepId)?.lessonTitle || 'Lesson',
      stepTitle: data.step.title,
      stepOrdinalText: `Step ${Number(data.step.position) + 1}`,
      isRequired: Boolean(data.step.isRequired),
      estimatedDurationMinutes: Number(data.step.estimatedDurationMinutes || 1),
      enrollmentId, stepId,
      isCompleted: Boolean(data.stepMeta?.isCompleted),
      outlineContent,
      previousStepUrl: data.previousStepId ? `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(data.previousStepId)}` : null,
      nextStepUrl: data.nextStepId ? `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(data.nextStepId)}` : null,
    };
    const content = data.step.content || {};
    appEl.innerHTML = kind === 'theory'
      ? renderTheoryStepPage({ ...common, markdownContent: String(content.markdown || content.markdownContent || content.body || content.content || '') })
      : renderVideoStepPage({ ...common, videoUrl: String(content.videoUrl || ''), transcript: content.transcript, captionVerified: Boolean(content.captionVerified) });
    initTheme();
    const videoFrame = appEl.querySelector<HTMLIFrameElement>('.video-embed-iframe');
    const videoFailure = appEl.querySelector<HTMLElement>('[data-video-fallback]');
    let videoLoadTimer: number | undefined;
    if (videoFrame && videoFailure) {
      const provider = videoFrame.dataset.provider;
      const frameUrl = new URL(videoFrame.src);
      const frameOrigin = frameUrl.origin;
      if (provider === 'youtube' || provider === 'vimeo') frameUrl.searchParams.set('origin', window.location.origin);
      videoFrame.dataset.retrySrc = frameUrl.toString();
      const showVideoFailure = () => {
        if (videoLoadTimer) window.clearTimeout(videoLoadTimer);
        lessonVideoLoadTimer = undefined;
        videoFailure.hidden = false;
      };
      const clearVideoLoadTimer = () => {
        if (videoLoadTimer) window.clearTimeout(videoLoadTimer);
        lessonVideoLoadTimer = undefined;
      };
      const startVideoLoadTimer = () => {
        if (videoLoadTimer) window.clearTimeout(videoLoadTimer);
        videoLoadTimer = window.setTimeout(showVideoFailure, 10000);
        lessonVideoLoadTimer = videoLoadTimer;
      };
      videoFrame.addEventListener('error', showVideoFailure);
      videoFrame.addEventListener('load', () => {
        if (provider === 'youtube') {
          videoFrame.contentWindow?.postMessage(JSON.stringify({ event: 'command', func: 'addEventListener', args: ['onReady'] }), frameOrigin);
        } else if (provider === 'vimeo') {
          videoFrame.contentWindow?.postMessage(JSON.stringify({ method: 'addEventListener', value: 'ready', player_id: 'zur-lesson-video' }), frameOrigin);
        } else {
          clearVideoLoadTimer();
        }
      });
      if (provider === 'youtube' || provider === 'vimeo') {
        const onPlayerMessage = (event: MessageEvent) => {
          if (event.source !== videoFrame.contentWindow || event.origin !== frameOrigin || !isCurrent()) return;
          let payload = event.data;
          if (typeof payload === 'string') {
            try { payload = JSON.parse(payload); } catch { return; }
          }
          const ready = provider === 'youtube' ? payload?.event === 'onReady' : payload?.event === 'ready';
          if (ready) {
            clearVideoLoadTimer();
            videoFailure.hidden = true;
          }
        };
        window.addEventListener('message', onPlayerMessage);
        lessonVideoReadyCleanup = () => window.removeEventListener('message', onPlayerMessage);
      }
      startVideoLoadTimer();
      if (provider === 'youtube' || provider === 'vimeo') videoFrame.src = frameUrl.toString();
      appEl.querySelector('[data-video-retry]')?.addEventListener('click', () => {
        videoFailure.hidden = true;
        const separator = videoFrame.dataset.retrySrc?.includes('?') ? '&' : '?';
        videoFrame.src = `${videoFrame.dataset.retrySrc || videoFrame.src}${separator}zur_retry=${Date.now()}`;
        startVideoLoadTimer();
      });
    }
    appEl.querySelectorAll<HTMLFormElement>('.complete-step-form').forEach((form) => form.addEventListener('submit', (event) => {
      event.preventDefault();
      const button = form.querySelector<HTMLButtonElement>('button');
      if (!button) return;
      button.disabled = true;
      void authClient.fetchApi(`/api/enrollments/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}/complete`, { method: 'POST', body: '{}' })
        .then(() => { if (isCurrent()) window.location.assign(common.nextStepUrl || common.courseOverviewUrl); })
        .catch(() => { if (!isCurrent()) return; button.disabled = false; const alert = document.createElement('p'); alert.setAttribute('role','alert'); alert.className='text-danger'; alert.textContent='Could not save completion. Check your connection and try again.'; form.prepend(alert); });
    }));
    if (kind === 'theory') {
      // Canonical media references are never loaded directly by the browser. Fetch with
      // the authenticated session, then replace with an object URL only after authorization.
      const mediaImages = [...appEl.querySelectorAll<HTMLImageElement>('img[src^="about:blank#zur-asset-"]')];
      for (const image of mediaImages) {
        const assetId = image.dataset.authorizedAsset || '';
        if (!/^[0-9a-f-]{36}$/i.test(assetId)) { if (isCurrent()) image.remove(); continue; }
        try {
          const response = await fetch(`/api/assets/${encodeURIComponent(assetId)}`, { cache: 'no-store', headers: { Authorization: `Bearer ${authClient.getToken() || ''}` } });
          if (!response.ok) throw new Error('media unavailable');
          if (!isCurrent()) continue;
          const blob = await response.blob();
          if (!isCurrent()) continue;
          if (!/^image\/(png|jpeg|webp|gif)$/.test(blob.type)) throw new Error('unsupported media');
          const objectUrl = URL.createObjectURL(blob);
          lessonMediaObjectUrls.add(objectUrl);
          image.src = objectUrl;
          image.addEventListener('error', () => {
            URL.revokeObjectURL(objectUrl);
            lessonMediaObjectUrls.delete(objectUrl);
            image.replaceWith(document.createTextNode('Image unavailable. Retry loading the lesson to try again.'));
          }, { once: true });
        } catch {
          if (!isCurrent()) continue;
          const fallback = document.createElement('span');
          fallback.className = 'lesson-media-fallback';
          fallback.setAttribute('role', 'status');
          fallback.textContent = image.alt ? `Image unavailable: ${image.alt}. Retry loading the lesson to try again.` : 'Image unavailable. Retry loading the lesson to try again.';
          image.replaceWith(fallback);
        }
      }
    }
    appEl.querySelectorAll<HTMLAnchorElement>('.lesson-rail a').forEach((link) => link.addEventListener('click', (event) => {
      if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
        event.preventDefault(); navigateTo(link.getAttribute('href') || link.href);
      }
    }));
  } catch (error: any) {
    if (!isCurrent()) return;
    if (error.statusCode === 404 || error.statusCode === 403) appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
    else showRouteFailure('We could not load this lesson. Retry when the service is available.', requestedPath);
  }
}

async function loadAttemptHistory(enrollmentId: string, stepId: string, attemptId: string | undefined, requestedPath: string): Promise<void> {
  const isCurrent = () => window.location.pathname + window.location.search === requestedPath;
  showRouteLoading('Submission history');
  try {
    const [step, page] = await Promise.all([
      authClient.fetchApi(`/api/enrollments/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}`),
      authClient.fetchApi(`/api/attempts?enrollmentId=${encodeURIComponent(enrollmentId)}&stepId=${encodeURIComponent(stepId)}&limit=10&offset=${Math.max(0, Number(new URLSearchParams(requestedPath.split('?')[1] || '').get('offset') || 0))}`),
    ]);
    if (!isCurrent()) return;
    const selected = attemptId ? await authClient.fetchApi(`/api/attempts/${encodeURIComponent(attemptId)}`) : null;
    if (!isCurrent()) return;
    appEl.innerHTML = renderAttemptHistoryPage({
      courseTitle: step.courseTitle || 'Course',
      courseOverviewUrl: `/learn/${encodeURIComponent(enrollmentId)}`,
      lessonTitle: step.stepMeta?.lessonTitle || 'Lesson',
      stepTitle: step.step?.title || 'Exercise',
      enrollmentId,
      stepId,
      workspaceUrl: `/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}`,
      attempts: page.items || [],
      selectedAttempt: selected,
      totalAttempts: page.total || 0,
      currentPage: Math.floor((page.offset || 0) / Math.max(1, page.limit || 10)) + 1,
      pageSize: page.limit || 10,
      offset: page.offset || 0,
      isCompact: window.innerWidth < 1024,
    });
    initTheme();
    document.getElementById('copy-code-btn')?.addEventListener('click', async () => {
      if (!selected?.codeSnapshot) return;
      await navigator.clipboard.writeText(selected.codeSnapshot);
    });
    document.getElementById('restore-to-editor-btn')?.addEventListener('click', () => {
      if (window.innerWidth < 1024) return;
      const dialog = document.getElementById('restore-confirm-dialog');
      if (dialog) dialog.hidden = false;
    });
    document.getElementById('cancel-restore-btn')?.addEventListener('click', () => {
      const dialog = document.getElementById('restore-confirm-dialog');
      if (dialog) dialog.hidden = true;
    });
    document.getElementById('confirm-restore-btn')?.addEventListener('click', async () => {
      if (!selected || window.innerWidth < 1024) return;
      const button = document.getElementById('confirm-restore-btn') as HTMLButtonElement;
      button.disabled = true;
      try {
        await authClient.fetchApi(`/api/attempts/${encodeURIComponent(attemptId!)}/restore`, { method: 'POST' });
        navigateTo(`/learn/${encodeURIComponent(enrollmentId)}/steps/${encodeURIComponent(stepId)}`);
      } catch {
        button.disabled = false;
        showRouteFailure('The saved draft changed or could not be restored. Your current editor content is preserved.', requestedPath);
      }
    });
  } catch (error: any) {
    if (!isCurrent()) return;
    if (error.statusCode === 404 || error.statusCode === 403) appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
    else showRouteFailure('We could not load submission history. Retry when the service is available.', requestedPath);
  }
}

async function savePythonDraft(code: string, baseRevision: number, enrollmentId: string, stepId: string): Promise<any> {
  const saved = await authClient.fetchApi('/api/drafts', {
    method: 'PUT',
    body: JSON.stringify({ enrollmentId, stepId, code, baseRevision }),
  });
  return saved;
}

function attachPythonWorkspaceListeners(
  initial: PythonWorkspacePageOptions,
  startingRevision: number,
  userId: string,
  isRevisionConflict: boolean,
  requestedPath: string,
): void {
  let code = initial.currentCode || '';
  let currentResult = initial.currentResult || null;
  let resultMode = initial.resultMode;
  let activeTab = initial.activeTab || 'results';
  const pendingJobKey = `zur_job_${userId}_${initial.enrollmentId}_${initial.stepId}`;
  const saveQueue = new DraftSaveQueue({
    revision: startingRevision,
    save: (snapshot, baseRevision) => savePythonDraft(snapshot, baseRevision, initial.enrollmentId, initial.stepId),
    onAcknowledged: (saved, _submittedCode, latestCode) => {
      if (window.location.pathname + window.location.search !== requestedPath) return;
      const hasUnsavedTail = latestCode !== saved.code;
      DraftManager.saveLocalDraft(userId, initial.enrollmentId, initial.stepId, latestCode, saved.revision);
      DraftManager.markUnsynced(userId, initial.enrollmentId, initial.stepId, hasUnsavedTail);
      setSaveState(hasUnsavedTail ? 'saving' : 'saved', hasUnsavedTail ? 'Saving…' : 'Saved');
      if (!hasUnsavedTail) document.getElementById('python-save-notice')?.remove();
    },
    onFailure: (error, latestCode) => {
      if (window.location.pathname + window.location.search !== requestedPath) return;
      const storedLocally = DraftManager.saveLocalDraft(userId, initial.enrollmentId, initial.stepId, latestCode, saveQueue.revision);
      DraftManager.markUnsynced(userId, initial.enrollmentId, initial.stepId, true);
      const isConflict = error?.code === 'STALE_REVISION';
      setSaveState(isConflict ? 'conflict' : 'unsaved', isConflict ? 'Draft conflict' : 'Unsaved edits (offline)');
      setDraftNotice(isConflict
        ? storedLocally ? 'A newer server draft exists. Your local code is preserved on this device.' : 'A newer server draft exists. Keep this page open and copy your code before leaving.'
        : storedLocally ? 'Changes are stored on this device. Reconnect to sync.' : 'Local storage is unavailable. Keep this page open and copy your code before leaving.', isConflict);
    },
  });

  const setSaveState = (status: NonNullable<PythonWorkspacePageOptions['saveStatus']>, text: string) => {
    document.querySelectorAll<HTMLElement>('.learning-header .save-indicator, #python-save-indicator').forEach((indicator) => {
      indicator.className = `save-indicator ${status}`;
      indicator.textContent = text;
    });
  };
  const setDraftNotice = (text: string, canResolveConflict = false) => {
    const main = document.querySelector('.learning-workspace-main');
    const region = main?.querySelector('.workspace-viewport');
    if (!main || !region) return;
    let notice = document.getElementById('python-save-notice');
    if (!notice) {
      notice = document.createElement('p');
      notice.id = 'python-save-notice';
      notice.className = 'alert alert-warning';
      notice.setAttribute('role', 'status');
      main.insertBefore(notice, region);
    }
    notice.textContent = text;
    notice.querySelector('.draft-conflict-actions')?.remove();
    if (canResolveConflict) {
      const actions = document.createElement('span');
      actions.className = 'draft-conflict-actions';
      for (const [id, label] of [['keep-local-draft-btn', 'Keep my local code'], ['use-server-draft-btn', 'Use saved server code']]) {
        const button = document.createElement('button');
        button.type = 'button';
        button.id = id;
        button.className = 'btn btn-secondary btn-compact';
        button.textContent = label;
        actions.append(button);
      }
      notice.append(actions);
      actions.querySelector('#keep-local-draft-btn')?.addEventListener('click', () => { void resolveDraftConflict('local'); });
      actions.querySelector('#use-server-draft-btn')?.addEventListener('click', () => { void resolveDraftConflict('server'); });
    }
  };
  const setResults = (overrides: Partial<PythonWorkspacePageOptions> = {}) => {
    const body = document.querySelector('.results-body');
    if (!body) return;
    body.innerHTML = renderPythonExecutionResults({
      currentResult,
      resultMode,
      executionError: null,
      ...overrides,
    });
    body.setAttribute('aria-live', 'polite');
  };
  const selectTab = (tabName: 'results' | 'custom_input') => {
    activeTab = tabName;
    document.querySelectorAll<HTMLButtonElement>('.results-tab-button[role="tab"]').forEach((tab) => {
      const selected = tab.textContent?.trim() === (tabName === 'results' ? 'Results' : 'Custom input');
      tab.classList.toggle('active', Boolean(selected));
      tab.setAttribute('aria-selected', String(Boolean(selected)));
    });
    const body = document.querySelector('.results-body');
    if (!body) return;
    if (tabName === 'custom_input') {
      body.innerHTML = '<div class="custom-input-box"><label for="custom-stdin-input" class="comparison-label">Custom Standard Input</label><textarea id="custom-stdin-input" class="code-editor-input" style="height: 100px; border: 1px solid var(--border-control); border-radius: var(--radius-sm);" placeholder="Enter custom stdin..."></textarea></div>';
      document.getElementById('custom-stdin-input')?.focus();
    } else {
      setResults();
    }
  };

  const textarea = document.getElementById('code-editor-input') as HTMLTextAreaElement | null;
  let editorView: EditorView | null = null;
  let suppressEditorChange = false;
  const readOnlyCompartment = new Compartment();
  if (textarea) {
    textarea.classList.add('cm-source-backup');
    document.querySelector('.code-editor-line-numbers')?.remove();
    editorView = new EditorView({
      state: EditorState.create({
        doc: textarea.value,
        extensions: [
          lineNumbers(), highlightActiveLineGutter(), history(), highlightActiveLine(),
          EditorState.tabSize.of(initial.indentationSpaces || 4),
          indentUnit.of(' '.repeat(initial.indentationSpaces || 4)),
          indentOnInput(), bracketMatching(), closeBrackets(), highlightSelectionMatches(),
          syntaxHighlighting(HighlightStyle.define([
            { tag: tags.keyword, color: 'var(--syntax-keyword)' },
            { tag: tags.string, color: 'var(--syntax-string)' },
            { tag: tags.number, color: 'var(--syntax-number)' },
            { tag: [tags.function(tags.variableName), tags.function(tags.propertyName)], color: 'var(--syntax-function)' },
            { tag: tags.comment, color: 'var(--syntax-comment)' },
          ])), python(),
          keymap.of([
            { key: 'Mod-Enter', run: () => {
              const input = document.getElementById('custom-stdin-input') as HTMLTextAreaElement | null;
              void execute(activeTab === 'custom_input' ? 'custom' : 'samples', input?.value || '');
              return true;
            } },
            { key: 'Escape', run: () => { document.getElementById('run-samples-btn')?.focus(); return true; } },
            indentWithTab, ...closeBracketsKeymap, ...searchKeymap, ...historyKeymap, ...defaultKeymap,
          ]),
          readOnlyCompartment.of(EditorState.readOnly.of(window.innerWidth < 1024)),
          EditorView.contentAttributes.of({ 'aria-label': 'Python Source Code', 'aria-multiline': 'true' }),
          EditorView.updateListener.of((update) => {
            if (!update.docChanged || suppressEditorChange) return;
            textarea.value = update.state.doc.toString();
            textarea.dispatchEvent(new Event('input'));
          }),
        ],
      }),
      parent: textarea.parentElement || undefined,
    });
    editorView.dom.style.fontSize = `${initial.editorFontSize || 14}px`;
  }
  const setEditorCode = (newCode: string) => {
    if (!editorView) return;
    suppressEditorChange = true;
    editorView.dispatch({ changes: { from: 0, to: editorView.state.doc.length, insert: newCode } });
    suppressEditorChange = false;
  };
  const resolveDraftConflict = async (choice: 'local' | 'server') => {
    if (!textarea) return;
    const localCode = textarea.value;
    const actionButtons = document.querySelectorAll<HTMLButtonElement>('.draft-conflict-actions button');
    actionButtons.forEach((button) => { button.disabled = true; });
    try {
      const serverDraft = await authClient.fetchApi(`/api/drafts?enrollmentId=${encodeURIComponent(initial.enrollmentId)}&stepId=${encodeURIComponent(initial.stepId)}`);
      if (choice === 'server') {
        code = serverDraft.code;
        textarea.value = serverDraft.code;
        setEditorCode(serverDraft.code);
        saveQueue.setServerState(serverDraft.code, serverDraft.revision);
        DraftManager.saveLocalDraft(userId, initial.enrollmentId, initial.stepId, serverDraft.code, serverDraft.revision);
        DraftManager.markUnsynced(userId, initial.enrollmentId, initial.stepId, false);
        isRevisionConflict = false;
        setSaveState('saved', 'Saved');
        document.getElementById('python-save-notice')?.remove();
        return;
      }
      code = localCode;
      isRevisionConflict = false;
      saveQueue.setServerState(serverDraft.code, serverDraft.revision);
      DraftManager.saveLocalDraft(userId, initial.enrollmentId, initial.stepId, localCode, serverDraft.revision);
      saveQueue.update(localCode);
      setSaveState('saving', 'Saving…');
      await saveQueue.flush();
      if (saveQueue.lastError) throw saveQueue.lastError;
    } catch {
      actionButtons.forEach((button) => { button.disabled = false; });
      setSaveState('conflict', 'Draft conflict');
      setDraftNotice('Your local code is preserved. The conflict could not be resolved; retry either choice.', true);
    }
  };
  if (isRevisionConflict) setDraftNotice(initial.saveNotice || 'A newer server draft exists. Choose which copy to keep.', true);
  if (isRevisionConflict || initial.saveStatus === 'unsaved') {
    DraftManager.markUnsynced(userId, initial.enrollmentId, initial.stepId, true);
  }
  if (textarea) {
    workspaceResizeController?.abort();
    workspaceResizeController = new AbortController();
    workspaceResizeController.signal.addEventListener('abort', () => editorView?.destroy(), { once: true });
    const updateCompactMode = () => {
      textarea.readOnly = window.innerWidth < 1024;
      editorView?.dispatch({ effects: readOnlyCompartment.reconfigure(EditorState.readOnly.of(window.innerWidth < 1024)) });
    };
    updateCompactMode();
    window.addEventListener('resize', updateCompactMode, { signal: workspaceResizeController.signal });
  }
  const workspaceViewport = document.querySelector<HTMLElement>('.paired-workspace .workspace-viewport');
  const workspaceSplitter = document.getElementById('workspace-splitter');
  const editorPane = document.querySelector<HTMLElement>('.paired-workspace .editor-pane');
  const resultsSplitter = document.getElementById('results-splitter');
  const resultsRegion = document.querySelector<HTMLElement>('.paired-workspace .workspace-results-region');
  const setProblemWidth = (width: number) => {
    if (!workspaceViewport || !workspaceSplitter) return;
    const bounded = Math.max(340, Math.min(width, workspaceViewport.clientWidth - 486));
    workspaceViewport.style.setProperty('--problem-pane-width', `${bounded}px`);
    workspaceSplitter.setAttribute('aria-valuenow', String(Math.round(bounded)));
  };
  const setResultsHeight = (height: number) => {
    if (!editorPane || !resultsSplitter || !resultsRegion) return;
    const bounded = Math.max(120, Math.min(height, editorPane.clientHeight - 284));
    editorPane.style.setProperty('--results-height', `${bounded}px`);
    resultsSplitter.setAttribute('aria-valuenow', String(Math.round(bounded)));
  };
  workspaceSplitter?.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    setProblemWidth((workspaceViewport?.querySelector('.problem-pane')?.clientWidth || 400) + (event.key === 'ArrowRight' ? 16 : -16));
  });
  resultsSplitter?.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    setResultsHeight((resultsRegion?.clientHeight || 240) + (event.key === 'ArrowUp' ? 16 : -16));
  });
  workspaceSplitter?.addEventListener('pointerdown', (event) => {
    if (window.innerWidth < 1024) return;
    workspaceSplitter.setPointerCapture(event.pointerId);
    const startX = event.clientX;
    const startWidth = workspaceViewport?.querySelector('.problem-pane')?.clientWidth || 400;
    const move = (moveEvent: PointerEvent) => setProblemWidth(startWidth + moveEvent.clientX - startX);
    workspaceSplitter.addEventListener('pointermove', move);
    workspaceSplitter.addEventListener('pointerup', () => workspaceSplitter.removeEventListener('pointermove', move), { once: true });
  });
  resultsSplitter?.addEventListener('pointerdown', (event) => {
    if (window.innerWidth < 1024) return;
    resultsSplitter.setPointerCapture(event.pointerId);
    const startY = event.clientY;
    const startHeight = resultsRegion?.clientHeight || 240;
    const move = (moveEvent: PointerEvent) => setResultsHeight(startHeight + startY - moveEvent.clientY);
    resultsSplitter.addEventListener('pointermove', move);
    resultsSplitter.addEventListener('pointerup', () => resultsSplitter.removeEventListener('pointermove', move), { once: true });
  });
  textarea?.addEventListener('input', () => {
    code = textarea.value;
    const storedLocally = DraftManager.saveLocalDraft(userId, initial.enrollmentId, initial.stepId, code, saveQueue.revision);
    DraftManager.markUnsynced(userId, initial.enrollmentId, initial.stepId, true);
    setSaveState(isRevisionConflict ? 'conflict' : storedLocally ? 'saving' : 'unsaved',
      isRevisionConflict ? 'Draft conflict' : storedLocally ? 'Saving…' : 'Unsaved edits');
    if (!storedLocally) setDraftNotice('Local storage is unavailable. Keep this page open and copy your code before leaving.');
    if (isRevisionConflict) return;
    saveQueue.update(code);
  });

  const execute = async (mode: 'samples' | 'custom' | 'submit', stdin?: string) => {
    code = textarea?.value ?? code;
    const runButton = document.getElementById(mode === 'submit' ? 'submit-solution-btn' : mode === 'custom' ? 'run-custom-btn' : 'run-samples-btn') as HTMLButtonElement | null;
    if (runButton) runButton.disabled = true;
    setResults({ inFlightStatus: 'queued' });
    try {
      const endpoint = mode === 'samples' ? '/api/execution/run-samples' : mode === 'custom' ? '/api/execution/run-custom' : '/api/execution/submit';
      const response = await authClient.fetchApi(endpoint, {
        method: 'POST',
        body: JSON.stringify({ enrollmentId: initial.enrollmentId, stepId: initial.stepId, code, stdin, idempotencyKey: crypto.randomUUID() }),
      });
      const jobId = response.job?.id;
      if (!jobId) throw new Error('Execution was not accepted.');
      localStorage.setItem(pendingJobKey, JSON.stringify({ jobId, mode }));
      const completed = await waitForJob(jobId);
      currentResult = completed.result;
      localStorage.removeItem(pendingJobKey);
      resultMode = mode;
      if (mode === 'submit' && currentResult?.verdict === 'PASSED') initial.isCompleted = true;
      selectTab('results');
      setResults();
      if (mode === 'submit' && currentResult?.verdict === 'PASSED') {
        const footer = document.querySelector('.learning-task-footer');
        if (footer && initial.nextStepUrl && !footer.querySelector('[data-python-continue]')) {
          const link = document.createElement('a'); link.href = initial.nextStepUrl; link.className = 'btn btn-primary btn-compact';
          link.textContent = 'Continue'; link.dataset.pythonContinue = 'true'; footer.append(link);
        }
      }
    } catch (error: any) {
      const safeMessage = error.statusCode === 429
        ? 'Too many execution requests. Your code is unchanged; wait briefly and try again.'
        : error.statusCode === 503
          ? 'Code execution is temporarily unavailable. Your code is unchanged; try again later.'
          : 'We could not check this code. Your code remains in the editor; try again.';
      selectTab('results');
      setResults({ executionError: safeMessage });
    } finally {
      if (runButton) runButton.disabled = false;
    }
  };

  const waitForJob = async (jobId: string): Promise<{ result: ExecutionResult }> => {
    while (window.location.pathname + window.location.search === requestedPath) {
      const state = await authClient.fetchApi(`/api/execution/jobs/${encodeURIComponent(jobId)}`);
      if (state.job?.status === 'completed') return state;
      setResults({ inFlightStatus: state.job?.status === 'running' ? 'running' : 'queued', inFlightJobId: jobId });
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    throw new Error('Navigation interrupted polling.');
  };

  try {
    const pending = JSON.parse(localStorage.getItem(pendingJobKey) || 'null');
    if (pending?.jobId) {
      resultMode = pending.mode;
      setResults({ inFlightStatus: 'reconnecting', inFlightJobId: pending.jobId });
      void waitForJob(pending.jobId).then((state) => {
        localStorage.removeItem(pendingJobKey);
        currentResult = state.result;
        selectTab('results');
        setResults();
      }).catch(() => setResults({ executionError: 'Could not reconnect to this execution. Your code is unchanged.' }));
    }
  } catch { localStorage.removeItem(pendingJobKey); }

  document.getElementById('run-samples-btn')?.addEventListener('click', () => void execute('samples'));
  document.getElementById('submit-solution-btn')?.addEventListener('click', () => void execute('submit'));
  document.querySelector('.results-body')?.addEventListener('click', (event) => {
    if ((event.target as HTMLElement).closest('#retry-execution-btn')) {
      void execute(resultMode === 'submit' ? 'submit' : resultMode === 'custom' ? 'custom' : 'samples');
    }
  });
  document.getElementById('run-custom-btn')?.addEventListener('click', () => {
    if (activeTab !== 'custom_input') {
      selectTab('custom_input');
      return;
    }
    const input = document.getElementById('custom-stdin-input') as HTMLTextAreaElement | null;
    void execute('custom', input?.value || '');
  });
  document.querySelectorAll<HTMLButtonElement>('.results-tab-button[role="tab"]').forEach((tab) => {
    tab.addEventListener('click', () => {
      if (tab.textContent?.trim() === 'Results') {
        selectTab('results');
      } else if (tab.textContent?.trim() === 'Custom input') {
        selectTab('custom_input');
      }
    });
  });
  textarea?.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key === 'Enter') {
      event.preventDefault();
      const input = document.getElementById('custom-stdin-input') as HTMLTextAreaElement | null;
      void execute(activeTab === 'custom_input' ? 'custom' : 'samples', input?.value || '');
    }
  });
  document.getElementById('reset-code-btn')?.addEventListener('click', async () => {
    if (window.innerWidth < 1024) return;
    if (!window.confirm('Reset your code to the starter version? Your current editor contents will be replaced.')) return;
    const resetButton = document.getElementById('reset-code-btn') as HTMLButtonElement | null;
    if (resetButton) resetButton.disabled = true;
    try {
      await saveQueue.flush();
      if (saveQueue.lastError) {
        setSaveState(saveQueue.lastError?.code === 'STALE_REVISION' ? 'conflict' : 'unsaved', 'Reset unavailable');
        setDraftNotice('Sync your latest code before resetting. Your local copy is preserved.');
        return;
      }
      const reset = await authClient.fetchApi('/api/drafts/reset', { method: 'POST', body: JSON.stringify({ enrollmentId: initial.enrollmentId, stepId: initial.stepId, expectedRevision: saveQueue.revision }) });
      saveQueue.setServerState(reset.code, reset.revision);
      code = reset.code;
      DraftManager.saveLocalDraft(userId, initial.enrollmentId, initial.stepId, code, reset.revision);
      DraftManager.markUnsynced(userId, initial.enrollmentId, initial.stepId, false);
      document.getElementById('python-save-notice')?.remove();
      if (textarea) textarea.value = code;
      setEditorCode(code);
      currentResult = null;
      resultMode = undefined;
      setResults();
      setSaveState('saved', 'Saved');
    } catch (error: any) {
      const stale = error?.code === 'STALE_REVISION';
      setSaveState(stale ? 'conflict' : 'unsaved', stale ? 'Draft conflict' : 'Reset failed');
      setDraftNotice(stale
        ? 'A newer server draft exists. Your local code is preserved on this device; reload before resetting.'
        : 'Reset could not be saved. Your code remains in the editor.');
    } finally {
      if (resetButton) resetButton.disabled = false;
    }
  });
}

async function loadPublishReview(courseId: string, requestedPath: string, staleRevision = false): Promise<void> {
  const isCurrent = () => window.location.pathname + window.location.search === requestedPath;
  const encodedCourseId = encodeURIComponent(courseId);
  showRouteLoading('Review publication');
  try {
    const course = await authClient.fetchApi(`/api/author/courses/${encodedCourseId}`);
    const validation = await authClient.fetchApi(`/api/author/courses/${encodedCourseId}/validate`, { method: 'POST', body: JSON.stringify({}) });
    if (!isCurrent()) return;
    if (validation.draftRevision !== course.draftRevision) {
      return loadPublishReview(courseId, requestedPath, true);
    }
    const options: CoursePublishPageOptions = {
      courseId,
      courseTitle: course.title,
      publicationState: course.publicationStatus,
      hasUnpublishedChanges: course.hasUnpublishedChanges,
      draftRevision: course.draftRevision,
      currentVersionNumber: course.currentVersionNumber,
      newVersionNumber: (course.currentVersionNumber || 0) + 1,
      activeEnrolledStudents: course.studentCount,
      visibility: course.visibility,
      enrollmentPolicy: course.enrollmentPolicy,
      validation,
      staleRevision,
    };
    const render = (overrides: Partial<CoursePublishPageOptions> = {}) => {
      appEl.innerHTML = renderCoursePublishPage({ ...options, ...overrides });
      initTheme();
      attachPublishReviewListeners(courseId, requestedPath, options, render);
    };
    render();
  } catch (error: any) {
    if (!isCurrent()) return;
    if (error.statusCode === 404 || error.statusCode === 403) appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
    else showRouteFailure('We could not validate this saved draft. Retry after the service is available.', requestedPath);
  }
}

function attachPublishReviewListeners(
  courseId: string,
  requestedPath: string,
  options: CoursePublishPageOptions,
  render: (overrides?: Partial<CoursePublishPageOptions>) => void,
): void {
  const open = document.getElementById('publish-open-confirm');
  open?.addEventListener('click', () => {
    if (!options.validation.isValid) return;
    render({ showConfirmModal: true });
    document.getElementById('publish-confirm-submit')?.focus();
  });
  const cancel = () => {
    render({ showConfirmModal: false });
    document.getElementById('publish-open-confirm')?.focus();
  };
  document.getElementById('publish-cancel-confirm')?.addEventListener('click', cancel);
  const dialog = document.querySelector('[role="dialog"][aria-labelledby="publish-dialog-title"]');
  dialog?.addEventListener('keydown', (event) => { if ((event as KeyboardEvent).key === 'Escape') cancel(); });
  document.getElementById('publish-confirm-submit')?.addEventListener('click', async (event) => {
    const button = event.currentTarget as HTMLButtonElement;
    if (button.disabled || !options.validation.isValid) return;
    button.disabled = true;
    button.textContent = 'Publishing…';
    try {
      const receipt = await authClient.fetchApi(`/api/author/courses/${encodeURIComponent(courseId)}/publish`, {
        method: 'POST',
        body: JSON.stringify({ expectedRevision: options.draftRevision, idempotencyKey: crypto.randomUUID() }),
      });
      if (window.location.pathname + window.location.search !== requestedPath) return;
      appEl.innerHTML = renderCoursePublishPage({ ...options, publicationState: 'published', hasUnpublishedChanges: false, receipt });
      initTheme();
    } catch (error: any) {
      if (error.code === 'STALE_REVISION' || error.statusCode === 409) {
        void loadPublishReview(courseId, requestedPath, true);
      } else if (error.statusCode === 400) {
        void loadPublishReview(courseId, requestedPath);
      } else {
        const currentButton = document.getElementById('publish-confirm-submit') as HTMLButtonElement | null;
        if (currentButton) { currentButton.disabled = false; currentButton.textContent = options.currentVersionNumber ? `Publish Version ${options.newVersionNumber}` : 'Publish course'; }
        const warning = document.createElement('p'); warning.className = 'text-danger'; warning.setAttribute('role', 'alert');
        warning.textContent = 'Publication failed. The course remains on its current released version; retry after checking the draft status.';
        document.querySelector('[role="dialog"] .dialog-card')?.append(warning);
      }
    }
  });
}

async function loadAdminPage(path: string, displayName: string, email: string): Promise<void> {
  const headers = { Authorization: `Bearer ${authClient.getToken() || ''}` };
  const api = async (url: string) => { const res=await fetch(url,{headers}); if(!res.ok){const err=await res.json().catch(()=>({}));throw new Error(err.error?.message||`Admin request failed (${res.status})`);}return res.json(); };
  try {
    const search = new URL(path,window.location.origin).search;
    let data:any;
    if(path.split('?')[0]==='/admin') data=await api('/api/admin/operations');
    else if(path.split('?')[0]==='/admin/users') data=await api(`/api/admin/users${search}`);
    else if(path.startsWith('/admin/users/')) {
      const userId=decodeURIComponent(path.split('?')[0].split('/')[3]);
      data=await api(`/api/admin/users/${encodeURIComponent(userId)}`);
      const grant=new URL(path,window.location.origin).searchParams.get('supportAccess');
      if(grant) data.supportRecords=await api(`/api/admin/support-access/${encodeURIComponent(grant)}/records`);
    }
    else if(path.split('?')[0]==='/admin/courses') data=await api(`/api/admin/courses${search}`);
    else if(path.startsWith('/admin/courses/')) data=await api(`/api/admin/courses/${encodeURIComponent(path.split('?')[0].split('/')[3])}`);
    else if(path==='/admin/categories') data=await api('/api/admin/categories');
    else if(path.split('?')[0]==='/admin/reports') data=await api(`/api/admin/reports${search}`);
    else if(path.startsWith('/admin/reports/')) data=await api(`/api/admin/reports/${encodeURIComponent(path.split('?')[0].split('/')[3])}`);
    else if(path.split('?')[0]==='/admin/media') data=await api(`/api/admin/media${search}`);
    else if(path.split('?')[0]==='/admin/execution') { const [overview,jobs]=await Promise.all([api('/api/admin/operations'),api(`/api/admin/execution/jobs${search}`)]);data={overview,jobs}; }
    else if(path.startsWith('/admin/audit/')) data=await api(`/api/admin/audit/${encodeURIComponent(path.split('?')[0].split('/')[3])}`);
    else if(path==='/admin/audit') data=await api(`/api/admin/audit${search}`);
    else data={};
    if(window.location.pathname+window.location.search!==path&&window.location.pathname!==path.split('?')[0])return;
    appEl.innerHTML=renderAdminPage(path,data,undefined,{displayName,email});
  } catch(error:any) {
    appEl.innerHTML=renderAdminPage(path,null,error.message,{displayName,email});
  }
}

async function confirmUnsyncedSignOut(userId: string): Promise<boolean> {
  if (!DraftManager.hasUnsyncedWork(userId)) return true;
  return new Promise<boolean>((resolve) => {
    const dialog = document.createElement('dialog');
    dialog.className = 'modal-dialog';
    dialog.setAttribute('aria-labelledby', 'unsynced-signout-title');
    const title = document.createElement('h2');
    title.id = 'unsynced-signout-title';
    title.textContent = 'Unsynchronized code';
    const description = document.createElement('p');
    description.textContent = 'Some code is stored only on this device. Choose whether to synchronize it or discard it before signing out.';
    const error = document.createElement('p');
    error.className = 'form-error';
    error.setAttribute('role', 'alert');
    const actions = document.createElement('div');
    actions.className = 'dialog-actions';
    const button = (label: string, className: string) => {
      const element = document.createElement('button');
      element.type = 'button'; element.className = className; element.textContent = label;
      actions.append(element); return element;
    };
    const cancel = button('Keep editing', 'btn btn-ghost');
    const discard = button('Discard local code and sign out', 'btn btn-secondary');
    const sync = button('Synchronize and sign out', 'btn btn-primary');
    dialog.append(title, description, error, actions);
    document.body.append(dialog);
    const finish = (accepted: boolean) => { dialog.close(); dialog.remove(); resolve(accepted); };
    dialog.addEventListener('cancel', (event) => { event.preventDefault(); finish(false); });
    cancel.addEventListener('click', () => finish(false));
    discard.addEventListener('click', () => finish(true));
    sync.addEventListener('click', async () => {
      sync.disabled = true;
      error.textContent = '';
      try { await DraftManager.syncUnsyncedWork(userId); finish(true); }
      catch (problem: any) { error.textContent = problem?.message || 'Could not synchronize code. Keep editing or explicitly discard it.'; sync.disabled = false; }
    });
    dialog.showModal();
    sync.focus();
  });
}

export function navigateTo(path: string): void {
  window.history.pushState({}, '', path);
  renderApp(path);
}

export function renderApp(path: string = window.location.pathname + window.location.search): void {
  releaseLessonMediaObjectUrls();
  workspaceResizeController?.abort();
  workspaceResizeController = null;
  const match = matchRoute(path);

  if (!match) {
    appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
    initTheme();
    return;
  }

  const { route, params } = match;
  const searchParams = path.includes('?')
    ? new URL(path, window.location.origin).searchParams
    : new URLSearchParams(window.location.search);
  const currentUser = authClient.getUser();

  // Authentication guards for S3 (settings/learning), S4, S5, S6
  if (route.requiredCapability && !currentUser) {
    const returnTo = getSafeReturnDestination(path);
    navigateTo(`/sign-in?returnTo=${encodeURIComponent(returnTo)}`);
    return;
  }
  if (route.shell === 'S6' && !currentUser?.capabilities?.includes('admin')) {
    appEl.innerHTML = renderSafeDenialPage({ type: 'access-denied' });
    initTheme();
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

      if (route.pageId === 'P01') {
        const content = renderLandingPage({ isSignedIn: Boolean(currentUser) });
        appEl.innerHTML = renderPublicShell({
          activePath: path,
          user: currentUser,
          content,
        });
        break;
      }

      if (route.pageId === 'P02') {
        const q = searchParams.get('q') || '';
        const category = searchParams.get('category') || '';
        const level = searchParams.get('level') || '';
        const language = searchParams.get('language') || '';
        const page = Number(searchParams.get('page') || 1);

        const requestId = ++activeCatalogRequestId;

        const catalogState: CatalogPageProps = {
          courses: [],
          categories: [],
          total: 0,
          isLoading: true,
          filters: { q, category, level, language, page, limit: 12 },
        };

        const initialContent = renderCatalogPage(catalogState);
        appEl.innerHTML = renderPublicShell({
          activePath: '/courses',
          user: currentUser,
          content: initialContent,
        });
        attachCatalogListeners(catalogState);

        Promise.all([
          courseClient.listCategories().catch(() => []),
          courseClient.listCatalog({
            search: q || undefined,
            categoryId: category || undefined,
            level: level || undefined,
            language: language || undefined,
            limit: 12,
            offset: (page - 1) * 12,
          }),
        ])
          .then(([cats, catRes]) => {
            if (requestId !== activeCatalogRequestId || window.location.pathname !== '/courses') return;
            catalogState.categories = cats;
            catalogState.courses = catRes.courses;
            catalogState.total = catRes.total;
            catalogState.isLoading = false;
            const updatedContent = renderCatalogPage(catalogState);
            appEl.innerHTML = renderPublicShell({
              activePath: '/courses',
              user: currentUser,
              content: updatedContent,
            });
            attachCatalogListeners(catalogState);
          })
          .catch((err) => {
            if (requestId !== activeCatalogRequestId || window.location.pathname !== '/courses') return;
            catalogState.isLoading = false;
            catalogState.error = err.message || 'Failed to load course catalog';
            const updatedContent = renderCatalogPage(catalogState);
            appEl.innerHTML = renderPublicShell({
              activePath: '/courses',
              user: currentUser,
              content: updatedContent,
            });
            attachCatalogListeners(catalogState);
          });
        break;
      }

      if (route.pageId === 'P03') {
        const courseId = params.courseId;
        const isCurrentOverview = () => {
          const current = matchRoute(window.location.pathname);
          return current?.route.pageId === 'P03' && current.params.courseId === courseId;
        };
        const initialContent = renderCourseOverviewPage({ isLoading: true });
        appEl.innerHTML = renderPublicShell({
          activePath: path,
          user: currentUser,
          content: initialContent,
        });

        courseClient
          .getCourseOverview(courseId)
          .then((data) => {
            if (!isCurrentOverview()) return;
            const updatedContent = renderCourseOverviewPage({
              data,
              currentUser,
              isLoading: false,
            });
            appEl.innerHTML = renderPublicShell({
              activePath: path,
              user: currentUser,
              content: updatedContent,
            });

            let robotsMeta = document.querySelector('meta[name="robots"]');
            if (data.course.visibility === 'unlisted') {
              if (!robotsMeta) {
                robotsMeta = document.createElement('meta');
                robotsMeta.setAttribute('name', 'robots');
                document.head.appendChild(robotsMeta);
              }
              robotsMeta.setAttribute('content', 'noindex, nofollow');
            } else if (robotsMeta) {
              robotsMeta.removeAttribute('content');
            }

            attachCourseOverviewListeners(courseId);
          })
          .catch((err: any) => {
            if (!isCurrentOverview()) return;
            const isDenial = err.status === 404 || err.status === 403 || err.message === "This page isn't available.";
            if (isDenial) {
              appEl.innerHTML = renderSafeDenialPage({ type: 'not-found' });
            } else {
              const errorContent = renderCourseOverviewPage({
                isLoading: false,
                isServiceError: true,
              });
              appEl.innerHTML = renderPublicShell({
                activePath: path,
                user: currentUser,
                content: errorContent,
              });
              attachCourseOverviewListeners(courseId);
            }
          });
        break;
      }

      if (route.pageId === 'P40') {
        const courseId = searchParams.get('courseId') || '';
        const content = renderHelpPage({ courseId });
        appEl.innerHTML = renderPublicShell({
          activePath: path,
          user: currentUser,
          content,
        });
        attachHelpListeners(courseId);
        break;
      }

      if (route.pageId === 'P41') {
        const isTerms = path === '/terms';
        const content = renderPolicyPage({ type: isTerms ? 'terms' : 'privacy' });
        appEl.innerHTML = renderPublicShell({
          activePath: path,
          user: currentUser,
          content,
        });
        break;
      }

      const content = `<div class="container py-8"><h1 class="h1">${route.title}</h1></div>`;
      appEl.innerHTML = renderPublicShell({
        activePath: path,
        user: currentUser,
        content,
      });
      break;
    }

    case 'S2': {
      if (route.pageId === 'P08') { void loadInvitationPage(params.token, path); break; }
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
      if (['P09', 'P10', 'P11', 'P21'].includes(route.pageId)) { void loadS2Page(route.pageId, params, path); break; }
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
        const savedTheme = (localStorage.getItem('zur_theme_preference') as 'dark' | 'light' | 'system') || 'dark';
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
        const privacyPath=window.location.pathname+window.location.search;
        void authClient.getPrivacyStatus().then((status)=>{
          if(window.location.pathname+window.location.search!==privacyPath)return;
          appEl.innerHTML=renderAppShell({activePath:path,user,headerTitle:'Privacy and account requests',content:renderPrivacySettingsPage(status)});
          attachPrivacyListeners();
        }).catch((error:any)=>{
          if(window.location.pathname+window.location.search!==privacyPath)return;
          const region=document.getElementById('privacy-error');if(region){region.className='form-error mb-6 p-3 border border-danger rounded';region.textContent=error.message||'Could not load request status.';}
        });
      } else if (route.pageId === 'P43') {
        // AI Connections (P43)
        void renderAiConnectionsSettings(path, user);
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
      } else if (route.pageId === 'P45') {
        // Agent Activity & Draft Recovery (P45)
        const courseId = params.courseId || 'course-sample';
        appEl.innerHTML = renderAgentActivityPage({
          courseId,
          courseTitle: 'Course Title',
          publicationState: 'draft',
          hasUnpublishedChanges: false,
          activities: [],
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
            <a href="/learn/enr-ada/steps/step-4-python-echo" class="btn btn-primary">Resume step</a>
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
      if (route.pageId === 'P26') { void loadS2Page(route.pageId, params, path); break; }
      if (route.pageId === 'P12') {
        void loadEnrolledStep(params.enrollmentId, params.stepId, path);
        break;
      }
      if (route.pageId === 'P16') {
        void loadAttemptHistory(params.enrollmentId, params.stepId, params.attemptId, path);
        break;
      }
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
      if (['P22', 'P23', 'P24', 'P25', 'P31'].includes(route.pageId)) { void loadS2Page(route.pageId, params, path); break; }
      if (route.pageId === 'P27') {
        void loadPublishReview(params.courseId, path);
        break;
      }
      if (route.pageId === 'P28') {
        const courseId = params.courseId || 'course-python-foundations';
        const search = searchParams.get('search') || undefined;
        const status = searchParams.get('status') || undefined;
        const version = searchParams.get('version') || undefined;
        const offset = Number(searchParams.get('offset') || 0);

        appEl.innerHTML = renderAuthorWorkspaceShell({
          courseId,
          courseTitle: 'Loading students and invitations…',
          publicationState: 'published',
          hasUnpublishedChanges: false,
          activeTab: 'students',
          editorContent: `
            <div class="p-8 text-center text-secondary">
              <p class="font-medium text-base mb-1">Loading students and invitations…</p>
            </div>
          `,
        });

        Promise.all([
          courseClient.getCourseOverview(courseId).catch(() => null),
          courseClient.getRoster(courseId, { search, status, version, offset }),
          courseClient.listInvitations(courseId),
        ]).then(([overview, rosterRes, invRes]) => {
          if (window.location.pathname.replace(/\/+$/, '') !== path.split('?')[0].replace(/\/+$/, '')) return;

          const courseTitle = overview?.course?.title || 'Python foundations';
          const pubStatus = (overview?.course?.publicationStatus || 'published') as any;

          appEl.innerHTML = renderStudentsAndInvitationsPage({
            courseId,
            courseTitle,
            publicationState: pubStatus,
            hasUnpublishedChanges: false,
            totalStudentsCount: rosterRes.total,
            roster: rosterRes,
            availableVersions: rosterRes.versions,
            invitations: invRes.invitations || [],
            filters: { search, status, version },
          });

          attachRosterListeners(courseId, { search, status, version });
        }).catch((err) => {
          appEl.innerHTML = renderAuthorWorkspaceShell({
            courseId,
            courseTitle: 'Course Roster',
            publicationState: 'published',
            hasUnpublishedChanges: false,
            activeTab: 'students',
            editorContent: `
              <div class="p-8 text-center text-danger">
                <p class="font-bold text-lg mb-2">Failed to load course roster</p>
                <p class="text-sm text-secondary mb-4">${escapeHtml(err.message)}</p>
                <button class="btn btn-secondary" onclick="window.location.reload()">Retry</button>
              </div>
            `,
          });
        });
        break;
      }

      if (route.pageId === 'P29') {
        const courseId = params.courseId || 'course-python-foundations';
        const enrollmentId = params.enrollmentId;
        let selectedStepId = searchParams.get('stepId') || undefined;
        const selectedAttemptId = searchParams.get('attemptId') || undefined;

        appEl.innerHTML = renderAuthorWorkspaceShell({
          courseId,
          courseTitle: 'Loading student detail…',
          publicationState: 'published',
          hasUnpublishedChanges: false,
          activeTab: 'students',
          editorContent: `
            <div class="p-8 text-center text-secondary">
              <p class="font-medium text-base mb-1">Loading student progress and attempts…</p>
            </div>
          `,
        });

        Promise.all([
          courseClient.getCourseOverview(courseId).catch(() => null),
          courseClient.getStudentDetail(courseId, enrollmentId),
        ]).then(async ([overview, detailData]) => {
          if (window.location.pathname.replace(/\/+$/, '') !== path.split('?')[0].replace(/\/+$/, '')) return;

          selectedStepId ||= detailData.curriculum?.[0]?.lessons?.[0]?.steps?.[0]?.id;
          let attemptPagination;
          if (selectedStepId) {
            const offset = Math.max(0, Number(searchParams.get('attemptOffset') || 0));
            const attemptsPage = await courseClient.getStudentAttempts(courseId, enrollmentId, selectedStepId, 10, offset);
            attemptPagination = { offset: attemptsPage.offset, limit: attemptsPage.limit, total: attemptsPage.total };
            const selectedId = selectedAttemptId || attemptsPage.items?.[0]?.id;
            const selected = selectedId ? await courseClient.getStudentAttempt(courseId, enrollmentId, selectedStepId, selectedId) : null;
            detailData.attempts = { [selectedStepId]: (attemptsPage.items || []).map((attempt: any) => ({
              id: attempt.id, attemptNumber: attempt.attemptNumber, verdict: attempt.verdict,
              score: null, submittedAt: attempt.submittedAt, isLatest: false,
            })) };
            if (selected) {
              const row = detailData.attempts[selectedStepId].find((attempt: any) => attempt.id === selected.id);
              if (row) row.submittedCode = selected.submittedCode;
            }
          }

          const courseTitle = detailData.enrollment.courseTitle || overview?.course?.title || 'Python foundations';
          const pubStatus = (overview?.course?.publicationStatus || 'published') as any;

          appEl.innerHTML = renderStudentDetailPage({
            courseId,
            courseTitle,
            publicationState: pubStatus,
            hasUnpublishedChanges: false,
            data: detailData,
            selectedStepId,
            selectedAttemptId,
            attemptPagination,
          });

          attachStudentDetailListeners(courseId, enrollmentId, detailData);
        }).catch((err) => {
          appEl.innerHTML = renderAuthorWorkspaceShell({
            courseId,
            courseTitle: 'Student Detail',
            publicationState: 'published',
            hasUnpublishedChanges: false,
            activeTab: 'students',
            editorContent: `
              <div class="p-8 text-center text-danger">
                <p class="font-bold text-lg mb-2">Failed to load student detail</p>
                <p class="text-sm text-secondary mb-4">${escapeHtml(err.message)}</p>
                <a href="/teach/${escapeHtml(courseId)}/students" class="btn btn-secondary">← Back to students</a>
              </div>
            `,
          });
        });
        break;
      }

      if (route.pageId === 'P30') {
        const courseId = params.courseId || 'course-python-foundations';
        const versionNumber = searchParams.get('version') ? Number(searchParams.get('version')) : undefined;
        const windowDays = searchParams.get('windowDays') ? Number(searchParams.get('windowDays')) : undefined;

        appEl.innerHTML = renderAuthorWorkspaceShell({
          courseId,
          courseTitle: 'Computing course analytics…',
          publicationState: 'published',
          hasUnpublishedChanges: false,
          activeTab: 'analytics',
          editorContent: `
            <div class="p-8 text-center text-secondary">
              <p class="font-medium text-base mb-1">Computing exact course metrics…</p>
            </div>
          `,
        });

        Promise.all([
          courseClient.getCourseOverview(courseId).catch(() => null),
          courseClient.getCourseAnalytics(courseId, { versionNumber, windowDays }),
        ]).then(([overview, analyticsData]) => {
          if (window.location.pathname.replace(/\/+$/, '') !== path.split('?')[0].replace(/\/+$/, '')) return;

          const courseTitle = overview?.course?.title || 'Python foundations';
          const pubStatus = (overview?.course?.publicationStatus || 'published') as any;

          appEl.innerHTML = renderCourseAnalyticsPage({
            courseId,
            courseTitle,
            publicationState: pubStatus,
            hasUnpublishedChanges: false,
            analytics: analyticsData,
            availableVersions: analyticsData.versions || [],
            filters: { versionId: versionNumber ? String(versionNumber) : undefined, windowDays },
          });

          attachCourseAnalyticsListeners(courseId);
        }).catch((err) => {
          appEl.innerHTML = renderAuthorWorkspaceShell({
            courseId,
            courseTitle: 'Course Analytics',
            publicationState: 'published',
            hasUnpublishedChanges: false,
            activeTab: 'analytics',
            editorContent: `
              <div class="p-8 text-center text-danger">
                <p class="font-bold text-lg mb-2">Failed to load course analytics</p>
                <p class="text-sm text-secondary mb-4">${escapeHtml(err.message)}</p>
                <button class="btn btn-secondary" onclick="window.location.reload()">Retry</button>
              </div>
            `,
          });
        });
        break;
      }

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
      const actor = currentUser!;
      appEl.innerHTML = renderAdminPage(path, null, undefined, { displayName: actor.displayName, email: actor.email });
      void loadAdminPage(path, actor.displayName, actor.email);
      break;
    }
  }

  initTheme();
}

// --- DOM Event Listeners & Interaction Wiring ---

function attachCatalogListeners(catalogState: CatalogPageProps): void {
  // Search form submit & debounced search input
  const searchForm = document.getElementById('catalog-search-form') as HTMLFormElement | null;
  const searchInput = document.getElementById('catalog-search-input') as HTMLInputElement | null;
  let debounceTimer: ReturnType<typeof setTimeout> | null = null;

  if (searchInput) {
    searchInput.addEventListener('input', () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      debounceTimer = setTimeout(() => {
        const val = searchInput.value.trim();
        const url = new URL(window.location.href);
        const currentQ = url.searchParams.get('q') || '';
        if (val !== currentQ) {
          if (val) {
            url.searchParams.set('q', val);
          } else {
            url.searchParams.delete('q');
          }
          url.searchParams.delete('page');
          navigateTo(url.pathname + url.search);
        }
      }, 300);
    });
  }

  if (searchForm && searchInput) {
    searchForm.addEventListener('submit', (e) => {
      e.preventDefault();
      if (debounceTimer) clearTimeout(debounceTimer);
      const val = searchInput.value.trim();
      const url = new URL(window.location.href);
      if (val) {
        url.searchParams.set('q', val);
      } else {
        url.searchParams.delete('q');
      }
      url.searchParams.delete('page');
      navigateTo(url.pathname + url.search);
    });
  }

  // Filter dropdowns
  const filterCat = document.getElementById('filter-category') as HTMLSelectElement | null;
  if (filterCat) {
    filterCat.addEventListener('change', () => {
      const url = new URL(window.location.href);
      if (filterCat.value) {
        url.searchParams.set('category', filterCat.value);
      } else {
        url.searchParams.delete('category');
      }
      url.searchParams.delete('page');
      navigateTo(url.pathname + url.search);
    });
  }

  const filterLevel = document.getElementById('filter-level') as HTMLSelectElement | null;
  if (filterLevel) {
    filterLevel.addEventListener('change', () => {
      const url = new URL(window.location.href);
      if (filterLevel.value) {
        url.searchParams.set('level', filterLevel.value);
      } else {
        url.searchParams.delete('level');
      }
      url.searchParams.delete('page');
      navigateTo(url.pathname + url.search);
    });
  }

  const filterLang = document.getElementById('filter-language') as HTMLSelectElement | null;
  if (filterLang) {
    filterLang.addEventListener('change', () => {
      const url = new URL(window.location.href);
      if (filterLang.value) {
        url.searchParams.set('language', filterLang.value);
      } else {
        url.searchParams.delete('language');
      }
      url.searchParams.delete('page');
      navigateTo(url.pathname + url.search);
    });
  }

  // Clear filters button (multiple could exist: desktop button, mobile clear, empty state clear button)
  const clearButtons = document.querySelectorAll('[data-action="clear-filters"], #btn-clear-filters');
  clearButtons.forEach((btn) => {
    btn.addEventListener('click', () => {
      navigateTo('/courses');
    });
  });

  // Pagination buttons
  const prevBtn = document.querySelector('[data-action="prev-page"]');
  if (prevBtn) {
    prevBtn.addEventListener('click', () => {
      const curPage = Math.max(1, catalogState.filters.page || 1);
      if (curPage > 1) {
        const url = new URL(window.location.href);
        url.searchParams.set('page', String(curPage - 1));
        navigateTo(url.pathname + url.search);
      }
    });
  }

  const nextBtn = document.querySelector('[data-action="next-page"]');
  if (nextBtn) {
    nextBtn.addEventListener('click', () => {
      const curPage = Math.max(1, catalogState.filters.page || 1);
      const url = new URL(window.location.href);
      url.searchParams.set('page', String(curPage + 1));
      navigateTo(url.pathname + url.search);
    });
  }

  // Mobile Filter Sheet: keyboard accessible with focus entry, Escape close, and focus restoration
  const mobileSheet = document.getElementById('mobile-filter-sheet');
  const openSheetBtn = document.querySelector('[data-action="open-sheet"]');
  const closeSheetBtns = document.querySelectorAll('[data-action="close-sheet"]');
  const applyMobileBtn = document.querySelector('[data-action="apply-mobile-filters"]');

  let mobileTriggerElement: HTMLElement | null = null;

  const handleMobileSheetKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeMobileSheet();
    }
  };

  function openMobileSheet(): void {
    if (!mobileSheet) return;
    mobileTriggerElement = document.activeElement as HTMLElement | null;
    mobileSheet.style.display = 'flex';
    mobileSheet.classList.add('open');
    document.addEventListener('keydown', handleMobileSheetKeyDown);
    const firstInput = mobileSheet.querySelector('select, input, button') as HTMLElement | null;
    firstInput?.focus();
  }

  function closeMobileSheet(): void {
    if (!mobileSheet) return;
    mobileSheet.style.display = 'none';
    mobileSheet.classList.remove('open');
    document.removeEventListener('keydown', handleMobileSheetKeyDown);
    mobileTriggerElement?.focus();
  }

  if (openSheetBtn) {
    openSheetBtn.addEventListener('click', openMobileSheet);
  }

  closeSheetBtns.forEach((btn) => {
    btn.addEventListener('click', closeMobileSheet);
  });

  if (applyMobileBtn) {
    applyMobileBtn.addEventListener('click', () => {
      const mobileCat = (document.getElementById('mobile-filter-category') as HTMLSelectElement | null)?.value;
      const mobileLevel = (document.getElementById('mobile-filter-level') as HTMLSelectElement | null)?.value;
      const mobileLang = (document.getElementById('mobile-filter-language') as HTMLSelectElement | null)?.value;

      const url = new URL(window.location.href);
      if (mobileCat) url.searchParams.set('category', mobileCat);
      else url.searchParams.delete('category');

      if (mobileLevel) url.searchParams.set('level', mobileLevel);
      else url.searchParams.delete('level');

      if (mobileLang) url.searchParams.set('language', mobileLang);
      else url.searchParams.delete('language');

      url.searchParams.delete('page');
      closeMobileSheet();
      navigateTo(url.pathname + url.search);
    });
  }

  // Retry button: keeps query/filter URL state
  const retryBtn = document.querySelector('[data-action="retry"]');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      renderApp(window.location.pathname + window.location.search);
    });
  }
}

function attachCourseOverviewListeners(courseId: string): void {
  // Retry button for service failures: re-renders overview route
  const retryBtn = document.querySelector('[data-action="retry"]');
  if (retryBtn) {
    retryBtn.addEventListener('click', () => {
      renderApp(window.location.pathname + window.location.search);
    });
  }

  const enrollBtns = document.querySelectorAll<HTMLButtonElement>('[data-action="enroll-course"], #btn-enroll-course');
  enrollBtns.forEach((btn) => {
    btn.addEventListener('click', async () => {
      enrollBtns.forEach((b) => {
        b.disabled = true;
        b.textContent = 'Enrolling…';
      });

      try {
        await courseClient.enrollInCourse(courseId);
        navigateTo('/learn');
      } catch (err: any) {
        enrollBtns.forEach((b) => {
          b.disabled = false;
          b.textContent = 'Enroll in course';
        });
        alert(err.message || 'Failed to enroll in course. Please try again.');
      }
    });
  });
}

function attachHelpListeners(courseId?: string): void {
  const modal = document.getElementById('report-issue-modal');
  const openBtn = document.querySelector('[data-action="open-report"]');
  const closeBtns = document.querySelectorAll('[data-action="close-report"]');
  const form = document.getElementById('report-issue-form') as HTMLFormElement | null;

  let helpTriggerElement: HTMLElement | null = null;

  const handleModalKeyDown = (e: KeyboardEvent) => {
    if (e.key === 'Escape') {
      closeReportModal();
    }
  };

  function openReportModal(): void {
    if (!modal) return;
    helpTriggerElement = document.activeElement as HTMLElement | null;
    modal.style.display = 'flex';
    modal.classList.add('open');
    document.addEventListener('keydown', handleModalKeyDown);
    const firstInput = modal.querySelector('input, select, textarea, button') as HTMLElement | null;
    firstInput?.focus();
  }

  function closeReportModal(): void {
    if (!modal) return;
    modal.style.display = 'none';
    modal.classList.remove('open');
    document.removeEventListener('keydown', handleModalKeyDown);
    helpTriggerElement?.focus();
  }

  if (openBtn) {
    openBtn.addEventListener('click', openReportModal);
  }

  closeBtns.forEach((btn) => {
    btn.addEventListener('click', closeReportModal);
  });

  if (form) {
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const submitBtn = form.querySelector('button[type="submit"]') as HTMLButtonElement | null;
      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Sending report…';
      }

      const reportCourseId = (document.getElementById('report-course-id') as HTMLInputElement)?.value || courseId || '';
      const type = (document.getElementById('report-type') as HTMLSelectElement)?.value || 'other';
      const description = (document.getElementById('report-description') as HTMLTextAreaElement)?.value || '';
      const courseVersionId = (document.getElementById('report-version-id') as HTMLInputElement)?.value || undefined;
      const stepId = (document.getElementById('report-step-id') as HTMLInputElement)?.value || undefined;
      const includeCodeConsent = (document.getElementById('report-include-code') as HTMLInputElement)?.checked || false;

      try {
        const res = await courseClient.submitReport({
          courseId: reportCourseId,
          courseVersionId,
          stepId,
          type,
          description,
          includeCodeConsent,
        });

        const currentUser = authClient.getUser();
        const content = renderHelpPage({
          courseId: reportCourseId,
          isReportModalOpen: true,
          reportSuccessReference: res.reference,
        });
        appEl.innerHTML = renderPublicShell({
          activePath: window.location.pathname,
          user: currentUser,
          content,
        });
        attachHelpListeners(reportCourseId);
      } catch (err: any) {
        const currentUser = authClient.getUser();
        const content = renderHelpPage({
          courseId: reportCourseId,
          courseVersionId,
          stepId,
          type,
          description,
          includeCode: includeCodeConsent,
          isReportModalOpen: true,
          reportError: err.message || 'Failed to submit report. Please try again.',
        });
        appEl.innerHTML = renderPublicShell({
          activePath: window.location.pathname,
          user: currentUser,
          content,
        });
        attachHelpListeners(reportCourseId);
        const descEl = document.getElementById('report-description') as HTMLTextAreaElement | null;
        descEl?.focus();
      }
    });
  }
}

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
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Invalid email or password.')}</span>`;
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
      const adultConfirmed = (form.elements.namedItem('adultConfirmed') as HTMLInputElement).checked;
      const submitBtn = document.getElementById('submit-sign-up') as HTMLButtonElement | null;

      if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Creating account…';
      }

      try {
        await authClient.signUp(displayName, email, password, adultConfirmed);
        navigateTo(`/verify-email?email=${encodeURIComponent(email)}`);
      } catch (err: any) {
        if (errorEl) {
          errorEl.className = 'form-error mb-4 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Could not create account.')}</span>`;
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
      const user = authClient.getUser();
      if (user && !await confirmUnsyncedSignOut(user.id)) return;
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
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Unable to process request.')}</span>`;
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
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Reset link expired or invalid.')}</span>`;
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
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Failed to update profile.')}</span>`;
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
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Failed to save appearance settings.')}</span>`;
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
      const user = authClient.getUser();
      if (user && !await confirmUnsyncedSignOut(user.id)) return;
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
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Failed to update password.')}</span>`;
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
      deleteModal.classList.remove('hidden');
    });
  }

  if (btnCancelDelete && deleteModal) {
    btnCancelDelete.addEventListener('click', () => {
      deleteModal.classList.add('hidden');
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
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Deletion request blocked.')}</span>`;
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
            exportDownloadUrl: result.downloadUrl,
            successMessage: 'Data export package generated.',
          }),
        });
        attachPrivacyListeners();
      } catch (err: any) {
        const errorEl = document.getElementById('privacy-error');
        if (errorEl) {
          errorEl.className = 'form-error mb-6 p-3 border border-danger rounded';
          errorEl.innerHTML = `<span aria-hidden="true">⚠</span> <span>${escapeHtml(err.message || 'Export failed.')}</span>`;
        }
        if (exportBtn) {
          exportBtn.disabled = false;
          exportBtn.textContent = 'Export my data';
        }
      }
    });
  }
}

function escapeHtml(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function attachRosterListeners(courseId: string, currentFilters: { search?: string; status?: string; version?: string }): void {
  // Tab switching
  const tabBtnEnrolled = document.getElementById('tab-btn-enrolled');
  const tabBtnInvitations = document.getElementById('tab-btn-invitations');
  const panelEnrolled = document.getElementById('panel-enrolled');
  const panelInvitations = document.getElementById('panel-invitations');

  tabBtnEnrolled?.addEventListener('click', () => {
    panelEnrolled?.classList.remove('hidden');
    panelInvitations?.classList.add('hidden');
    tabBtnEnrolled.classList.add('active', 'border-primary', 'text-primary');
    tabBtnEnrolled.classList.remove('border-transparent', 'text-secondary');
    tabBtnEnrolled.setAttribute('aria-selected', 'true');
    tabBtnInvitations?.classList.remove('active', 'border-primary', 'text-primary');
    tabBtnInvitations?.classList.add('border-transparent', 'text-secondary');
    tabBtnInvitations?.setAttribute('aria-selected', 'false');
  });

  tabBtnInvitations?.addEventListener('click', () => {
    panelInvitations?.classList.remove('hidden');
    panelEnrolled?.classList.add('hidden');
    tabBtnInvitations.classList.add('active', 'border-primary', 'text-primary');
    tabBtnInvitations.classList.remove('border-transparent', 'text-secondary');
    tabBtnInvitations.setAttribute('aria-selected', 'true');
    tabBtnEnrolled?.classList.remove('active', 'border-primary', 'text-primary');
    tabBtnEnrolled?.classList.add('border-transparent', 'text-secondary');
    tabBtnEnrolled?.setAttribute('aria-selected', 'false');
  });

  // Filters
  const searchInput = document.getElementById('roster-search') as HTMLInputElement | null;
  const statusSelect = document.getElementById('roster-status-filter') as HTMLSelectElement | null;
  const versionSelect = document.getElementById('roster-version-filter') as HTMLSelectElement | null;
  const applyBtn = document.getElementById('btn-apply-filters');
  const resetBtn = document.getElementById('btn-clear-roster-filters');

  const executeFilter = () => {
    const url = new URL(window.location.href);
    if (searchInput?.value?.trim()) {
      url.searchParams.set('search', searchInput.value.trim());
    } else {
      url.searchParams.delete('search');
    }
    if (statusSelect?.value && statusSelect.value !== 'all') {
      url.searchParams.set('status', statusSelect.value);
    } else {
      url.searchParams.delete('status');
    }
    if (versionSelect?.value) {
      url.searchParams.set('version', versionSelect.value);
    } else {
      url.searchParams.delete('version');
    }
    navigateTo(url.pathname + url.search);
  };

  applyBtn?.addEventListener('click', executeFilter);
  searchInput?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      executeFilter();
    }
  });
  statusSelect?.addEventListener('change', executeFilter);
  versionSelect?.addEventListener('change', executeFilter);

  resetBtn?.addEventListener('click', () => {
    const url = new URL(window.location.href);
    url.searchParams.delete('search');
    url.searchParams.delete('status');
    url.searchParams.delete('version');
    navigateTo(url.pathname + url.search);
  });

  // Modal dialog close
  const closeAllModals = () => {
    document.querySelectorAll('.modal-backdrop').forEach((m) => m.classList.add('hidden'));
  };

  document.querySelectorAll('[data-action="close-modal"]').forEach((btn) => {
    btn.addEventListener('click', closeAllModals);
  });

  // Open invite modal
  const btnOpenInvite = document.getElementById('btn-open-invite-modal');
  const inviteModal = document.getElementById('invite-students-modal');
  btnOpenInvite?.addEventListener('click', () => {
    inviteModal?.classList.remove('hidden');
    (document.getElementById('invite-recipient-email') as HTMLElement | null)?.focus();
  });

  // Invite modal tab toggling
  const inviteTabEmail = document.getElementById('invite-tab-email');
  const inviteTabLink = document.getElementById('invite-tab-link');
  const invitePanelEmail = document.getElementById('invite-panel-email');
  const invitePanelLink = document.getElementById('invite-panel-link');

  inviteTabEmail?.addEventListener('click', () => {
    invitePanelEmail?.classList.remove('hidden');
    invitePanelLink?.classList.add('hidden');
    inviteTabEmail.classList.add('active', 'border-primary', 'text-primary');
    inviteTabEmail.classList.remove('border-transparent', 'text-secondary');
    inviteTabLink?.classList.remove('active', 'border-primary', 'text-primary');
    inviteTabLink?.classList.add('border-transparent', 'text-secondary');
  });

  inviteTabLink?.addEventListener('click', () => {
    invitePanelLink?.classList.remove('hidden');
    invitePanelEmail?.classList.add('hidden');
    inviteTabLink.classList.add('active', 'border-primary', 'text-primary');
    inviteTabLink.classList.remove('border-transparent', 'text-secondary');
    inviteTabEmail?.classList.remove('active', 'border-primary', 'text-primary');
    inviteTabEmail?.classList.add('border-transparent', 'text-secondary');
  });

  // Send email invitation
  const formEmailInvite = document.getElementById('form-invite-email') as HTMLFormElement | null;
  const emailError = document.getElementById('email-invite-error');
  const emailSuccess = document.getElementById('email-invite-success');
  const btnSubmitEmail = document.getElementById('btn-submit-email-invite') as HTMLButtonElement | null;

  formEmailInvite?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = (document.getElementById('invite-recipient-email') as HTMLInputElement)?.value?.trim();
    if (!email) return;

    if (btnSubmitEmail) {
      btnSubmitEmail.disabled = true;
        btnSubmitEmail.textContent = 'Sending invitation…';
    }
    if (emailError) emailError.classList.add('hidden');
    if (emailSuccess) emailSuccess.classList.add('hidden');

    try {
      const created = await courseClient.createInvitation(courseId, { type: 'email', recipientEmail: email });
      const emailLink = document.getElementById('email-created-link') as HTMLInputElement;
      emailLink.value = `${window.location.origin}/join/${created.token}`;
      document.getElementById('email-created-link-container')?.classList.remove('hidden');
      if (emailSuccess) {
        emailSuccess.textContent = created.delivery?.message || 'Invitation is valid. Email delivery status is unavailable; copy its link to send it manually.';
        emailSuccess.classList.toggle('alert-success', created.delivery?.status === 'sent');
        emailSuccess.classList.toggle('alert-info', created.delivery?.status !== 'sent');
        emailSuccess.classList.remove('hidden');
      }
      btnSubmitEmail?.classList.add('hidden');
    } catch (err: any) {
      if (emailError) {
        emailError.textContent = err.message || 'Failed to create invitation.';
        emailError.classList.remove('hidden');
      }
    } finally {
      if (btnSubmitEmail) {
        btnSubmitEmail.disabled = false;
        btnSubmitEmail.textContent = 'Send invitation';
      }
    }
  });


  document.getElementById('btn-copy-email-link')?.addEventListener('click', async () => {
    const link = (document.getElementById('email-created-link') as HTMLInputElement)?.value;
    if (!link) return;
    try {
      await navigator.clipboard.writeText(link);
      const status = document.getElementById('email-invite-success');
      if (status) status.textContent = 'Link copied. Send it privately to the recipient.';
    } catch {
      const status = document.getElementById('email-invite-error');
      if (status) { status.textContent = 'Copy failed. Select the link and copy it manually.'; status.classList.remove('hidden'); }
    }
  });

  // Generate shareable link
  const formLinkInvite = document.getElementById('form-invite-link') as HTMLFormElement | null;
  const linkError = document.getElementById('link-invite-error');
  const btnCreateLink = document.getElementById('btn-create-shareable-link') as HTMLButtonElement | null;
  const genContainer = document.getElementById('generated-link-container');
  const genInput = document.getElementById('generated-invite-input') as HTMLInputElement | null;
  const btnCopyGenLink = document.getElementById('btn-copy-generated-link') as HTMLButtonElement | null;

  formLinkInvite?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const days = Number((document.getElementById('invite-link-days') as HTMLSelectElement)?.value || 14);
    const maxUsesVal = (document.getElementById('invite-link-max-uses') as HTMLInputElement)?.value?.trim();
    const maxUses = maxUsesVal ? Number(maxUsesVal) : undefined;

    if (btnCreateLink) {
      btnCreateLink.disabled = true;
      btnCreateLink.textContent = 'Generating…';
    }
    if (linkError) linkError.classList.add('hidden');

    try {
      const res = await courseClient.createInvitation(courseId, { type: 'shareable_link', expiresInDays: days, maxUses });
      const fullUrl = `${window.location.origin}/join/${res.token}`;
      if (genInput) genInput.value = fullUrl;
      genContainer?.classList.remove('hidden');
    } catch (err: any) {
      if (linkError) {
        linkError.textContent = err.message || 'Failed to generate link.';
        linkError.classList.remove('hidden');
      }
    } finally {
      if (btnCreateLink) {
        btnCreateLink.disabled = false;
        btnCreateLink.textContent = 'Generate shareable link';
      }
    }
  });

  btnCopyGenLink?.addEventListener('click', () => {
    if (genInput?.value) {
      navigator.clipboard.writeText(genInput.value);
      btnCopyGenLink.textContent = 'Copied!';
      setTimeout(() => {
        btnCopyGenLink.textContent = 'Copy link';
      }, 2000);
    }
  });

  // Copy link in table
  document.querySelectorAll<HTMLButtonElement>('[data-action="copy-invite-url"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = btn.dataset.copyUrl;
      if (url) {
        navigator.clipboard.writeText(url);
        const originalText = btn.textContent;
        btn.textContent = 'Copied!';
        setTimeout(() => {
          btn.textContent = originalText;
        }, 2000);
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-action="roster-page"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const url = new URL(window.location.href);
      const next = Number(btn.dataset.offset);
      if (next > 0) url.searchParams.set('offset', String(next));
      else url.searchParams.delete('offset');
      navigateTo(url.pathname + url.search);
    });
  });

  // Revoke invitation button
  document.querySelectorAll<HTMLButtonElement>('[data-action="revoke-invitation"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const invId = btn.dataset.invitationId;
      if (!invId) return;
      if (!confirm('Revoke this invitation? Anyone holding this link will no longer be able to enroll.')) return;
      try {
        await courseClient.revokeInvitation(invId);
        renderApp();
      } catch (err: any) {
        alert(err.message || 'Failed to revoke invitation.');
      }
    });
  });

  document.querySelectorAll<HTMLButtonElement>('[data-action="resend-invitation"]').forEach((btn) => {
    btn.addEventListener('click', async () => {
      const invId = btn.dataset.invitationId;
      if (!invId || !confirm('Regenerate this invitation link? The old link will stop working. Existing enrollments remain.')) return;
      btn.disabled = true;
      try {
        const result = await courseClient.resendInvitation(invId);
        inviteModal?.classList.remove('hidden');
        inviteTabEmail?.click();
        const emailLink = document.getElementById('email-created-link') as HTMLInputElement;
        emailLink.value = `${window.location.origin}/join/${result.token}`;
        document.getElementById('email-created-link-container')?.classList.remove('hidden');
        if (emailSuccess) {
          emailSuccess.textContent = result.delivery?.message || 'Invitation is valid. Email delivery status is unavailable; copy its link to send it manually.';
          emailSuccess.classList.toggle('alert-success', result.delivery?.status === 'sent');
          emailSuccess.classList.toggle('alert-info', result.delivery?.status !== 'sent');
          emailSuccess.classList.remove('hidden');
        }
        btnSubmitEmail?.classList.add('hidden');
      } catch (err: any) {
        alert(err.message || 'Failed to regenerate invitation.');
      } finally {
        btn.disabled = false;
      }
    });
  });

  // Open revoke student modal
  const revokeModal = document.getElementById('revoke-student-modal');
  const revokeNameEl = document.getElementById('revoke-student-display-name');
  const revokeIdInput = document.getElementById('revoke-enrollment-id-input') as HTMLInputElement | null;
  const revokeReasonInput = document.getElementById('revoke-reason-input') as HTMLInputElement | null;
  const btnConfirmRevoke = document.getElementById('btn-confirm-revoke') as HTMLButtonElement | null;

  document.querySelectorAll<HTMLButtonElement>('[data-action="open-revoke"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (revokeNameEl) revokeNameEl.textContent = btn.dataset.studentName || '';
      if (revokeIdInput) revokeIdInput.value = btn.dataset.enrollmentId || '';
      if (revokeReasonInput) revokeReasonInput.value = '';
      revokeModal?.classList.remove('hidden');
    });
  });

  btnConfirmRevoke?.addEventListener('click', async () => {
    const enrId = revokeIdInput?.value;
    if (!enrId) return;
    btnConfirmRevoke.disabled = true;
    btnConfirmRevoke.textContent = 'Revoking…';
    try {
      await courseClient.revokeStudent(courseId, enrId, revokeReasonInput?.value?.trim() || undefined);
      closeAllModals();
      renderApp();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke access.');
      btnConfirmRevoke.disabled = false;
      btnConfirmRevoke.textContent = 'Revoke access';
    }
  });

  // Open reinstate student modal
  const reinstateModal = document.getElementById('reinstate-student-modal');
  const reinstateNameEl = document.getElementById('reinstate-student-display-name');
  const reinstateIdInput = document.getElementById('reinstate-enrollment-id-input') as HTMLInputElement | null;
  const btnConfirmReinstate = document.getElementById('btn-confirm-reinstate') as HTMLButtonElement | null;

  document.querySelectorAll<HTMLButtonElement>('[data-action="open-reinstate"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (reinstateNameEl) reinstateNameEl.textContent = btn.dataset.studentName || '';
      if (reinstateIdInput) reinstateIdInput.value = btn.dataset.enrollmentId || '';
      reinstateModal?.classList.remove('hidden');
    });
  });

  btnConfirmReinstate?.addEventListener('click', async () => {
    const enrId = reinstateIdInput?.value;
    if (!enrId) return;
    btnConfirmReinstate.disabled = true;
    btnConfirmReinstate.textContent = 'Reinstating…';
    try {
      await courseClient.reinstateStudent(courseId, enrId);
      closeAllModals();
      renderApp();
    } catch (err: any) {
      alert(err.message || 'Failed to reinstate access.');
      btnConfirmReinstate.disabled = false;
      btnConfirmReinstate.textContent = 'Reinstate access';
    }
  });
}

function attachStudentDetailListeners(courseId: string, enrollmentId: string, detailData: any): void {
  const closeAllModals = () => {
    document.querySelectorAll('.modal-backdrop').forEach((m) => m.classList.add('hidden'));
  };

  document.querySelectorAll('[data-action="close-modal"]').forEach((btn) => {
    btn.addEventListener('click', closeAllModals);
  });

  // Step selection
  document.querySelectorAll<HTMLElement>('[data-action="select-step"]').forEach((el) => {
    el.addEventListener('click', () => {
      const stepId = el.dataset.stepId;
      if (stepId) {
        const url = new URL(window.location.href);
        url.searchParams.set('stepId', stepId);
        url.searchParams.delete('attemptId');
        navigateTo(url.pathname + url.search);
      }
    });
  });

  // Attempt selection
  document.querySelectorAll<HTMLButtonElement>('[data-action="select-attempt"]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const stepId = btn.dataset.stepId;
      const attemptId = btn.dataset.attemptId;
      if (stepId && attemptId) {
        const url = new URL(window.location.href);
        url.searchParams.set('stepId', stepId);
        url.searchParams.set('attemptId', attemptId);
        navigateTo(url.pathname + url.search);
      }
    });
  });

  // Revoke modal
  const btnOpenRevoke = document.getElementById('btn-open-revoke-detail');
  const revokeModal = document.getElementById('revoke-student-modal');
  const revokeReasonInput = document.getElementById('revoke-reason-input') as HTMLInputElement | null;
  const btnConfirmRevoke = document.getElementById('btn-confirm-revoke') as HTMLButtonElement | null;

  btnOpenRevoke?.addEventListener('click', () => {
    revokeModal?.classList.remove('hidden');
  });

  btnConfirmRevoke?.addEventListener('click', async () => {
    btnConfirmRevoke.disabled = true;
    btnConfirmRevoke.textContent = 'Revoking…';
    try {
      await courseClient.revokeStudent(courseId, enrollmentId, revokeReasonInput?.value?.trim() || undefined);
      closeAllModals();
      renderApp();
    } catch (err: any) {
      alert(err.message || 'Failed to revoke access.');
      btnConfirmRevoke.disabled = false;
      btnConfirmRevoke.textContent = 'Revoke access';
    }
  });

  // Reinstate modal
  const btnOpenReinstate = document.getElementById('btn-open-reinstate-detail');
  const reinstateModal = document.getElementById('reinstate-student-modal');
  const btnConfirmReinstate = document.getElementById('btn-confirm-reinstate') as HTMLButtonElement | null;

  btnOpenReinstate?.addEventListener('click', () => {
    reinstateModal?.classList.remove('hidden');
  });

  btnConfirmReinstate?.addEventListener('click', async () => {
    btnConfirmReinstate.disabled = true;
    btnConfirmReinstate.textContent = 'Reinstating…';
    try {
      await courseClient.reinstateStudent(courseId, enrollmentId);
      closeAllModals();
      renderApp();
    } catch (err: any) {
      alert(err.message || 'Failed to reinstate access.');
      btnConfirmReinstate.disabled = false;
      btnConfirmReinstate.textContent = 'Reinstate access';
    }
  });
}

function attachCourseAnalyticsListeners(courseId: string): void {
  const versionSelect = document.getElementById('analytics-version-filter') as HTMLSelectElement | null;
  const windowSelect = document.getElementById('analytics-window-filter') as HTMLSelectElement | null;
  const applyBtn = document.getElementById('btn-apply-analytics-filters');

  const executeAnalyticsFilter = () => {
    const url = new URL(window.location.href);
    if (versionSelect?.value) {
      url.searchParams.set('version', versionSelect.value);
    } else {
      url.searchParams.delete('version');
    }
    if (windowSelect?.value) {
      url.searchParams.set('windowDays', windowSelect.value);
    } else {
      url.searchParams.delete('windowDays');
    }
    navigateTo(url.pathname + url.search);
  };

  applyBtn?.addEventListener('click', executeAnalyticsFilter);
  versionSelect?.addEventListener('change', executeAnalyticsFilter);
  windowSelect?.addEventListener('change', executeAnalyticsFilter);
}

// Global click handler for internal SPA navigation and interactive widgets
document.addEventListener('submit', async (event) => {
  const previewForm=(event.target as HTMLElement).closest('form[data-admin-preview]') as HTMLFormElement|null;
  if(previewForm){
    event.preventDefault();const values=Object.fromEntries(new FormData(previewForm).entries());const button=previewForm.querySelector('button') as HTMLButtonElement|null;if(button){button.disabled=true;button.textContent='Checking and loading…';}
    try{const response=await fetch(previewForm.getAttribute('action')||'',{method:'POST',headers:{Authorization:`Bearer ${authClient.getToken()||''}`,'Content-Type':'application/json'},body:JSON.stringify(values)});if(!response.ok){const err=await response.json().catch(()=>({}));throw new Error(err.error?.message||'Preview is unavailable.');}const blob=await response.blob();if(!blob.type.startsWith('image/'))throw new Error('The preview did not contain a safe image.');const src=URL.createObjectURL(blob);const dialog=document.createElement('dialog');dialog.className='admin-media-preview-dialog';dialog.innerHTML=`<form method="dialog"><button class="btn btn-secondary">Close preview</button></form><img alt="Authorized media preview" src="${src}">`;document.body.append(dialog);dialog.addEventListener('close',()=>{URL.revokeObjectURL(src);dialog.remove();});dialog.showModal();}
    catch(error:any){const feedback=document.createElement('p');feedback.className='text-danger';feedback.setAttribute('role','alert');feedback.textContent=error.message;previewForm.append(feedback);}finally{if(button){button.disabled=false;button.textContent='Safe preview';}}
    return;
  }
  const exportForm=(event.target as HTMLElement).closest('form[data-admin-export]') as HTMLFormElement|null;
  if(exportForm){
    event.preventDefault();const feedback=exportForm.querySelector('.form-error') as HTMLElement|null;const button=exportForm.querySelector('button[type="submit"]') as HTMLButtonElement|null;if(button){button.disabled=true;button.textContent='Preparing export…';}
    try{const response=await fetch(exportForm.getAttribute('action')||'',{method:'POST',headers:{Authorization:`Bearer ${authClient.getToken()||''}`,'Content-Type':'application/json'},body:JSON.stringify(Object.fromEntries(new FormData(exportForm).entries()))});const result=await response.json().catch(()=>({}));if(!response.ok)throw new Error(result.error?.message||'The export could not be prepared.');if(feedback){feedback.classList.remove('hidden');feedback.classList.add('text-success');feedback.setAttribute('role','status');feedback.textContent=`Export is ready for the account owner in Privacy settings until ${new Date(result.expiresAt).toLocaleString()}.`;}if(button)button.textContent='Export prepared';}
    catch(error:any){if(feedback){feedback.textContent=error.message;feedback.classList.remove('hidden');}if(button){button.disabled=false;button.textContent='Prepare export for user';}}
    return;
  }
  const form = (event.target as HTMLElement).closest('form[data-admin-mutation]') as HTMLFormElement | null;
  if (!form) return;
  event.preventDefault();
  const action=form.getAttribute('action')||'';
  const method=(form.getAttribute('method')||'post').toUpperCase();
  const values=Object.fromEntries(new FormData(form).entries()) as Record<string,string>;
  if(values.suspended!==undefined) values.suspended=String(values.suspended==='true');
  if(values.versionStep){ const [versionId,stepId]=values.versionStep.split('|');values.versionId=versionId;values.stepId=stepId;delete values.versionStep; }
  const feedback=form.querySelector('.form-error') as HTMLElement|null;
  const button=form.querySelector('button[type="submit"]') as HTMLButtonElement|null;
  if(button){button.disabled=true;button.dataset.label=button.textContent||'';button.textContent='Confirming…';}
  if(feedback){feedback.textContent='';feedback.classList.add('hidden');}
  try{
    const res=await fetch(action,{method,headers:{Authorization:`Bearer ${authClient.getToken()||''}`,'Content-Type':'application/json'},body:JSON.stringify(values)});
    const body=await res.json().catch(()=>({}));
    if(!res.ok)throw new Error(body.error?.message||'The administrator action could not be completed.');
    if(action==='/api/admin/support-access') { navigateTo(`/admin/users/${encodeURIComponent(body.userId)}?supportAccess=${encodeURIComponent(body.id)}`);return; }
    renderApp(window.location.pathname+window.location.search);
  }catch(error:any){
    if(feedback){feedback.textContent=error.message;feedback.classList.remove('hidden');}
    if(button){button.disabled=false;button.textContent=button.dataset.label||'Retry';}
  }
});
document.addEventListener('change', async (event) => {
  const select=(event.target as HTMLElement).closest('[data-waiver-step]') as HTMLSelectElement|null;
  if(!select)return;
  const form=select.closest('form') as HTMLFormElement|null;if(!form)return;
  const [versionId,stepId]=(select.value||'').split('|');const action=form.getAttribute('action')||'';
  const output=form.querySelector('.waiver-review-count') as HTMLElement|null;const countField=form.querySelector('[name="reviewedAffectedCount"]') as HTMLInputElement|null;const button=form.querySelector('button[type="submit"]') as HTMLButtonElement|null;
  if(output)output.textContent='Checking affected enrollments…';if(button)button.disabled=true;
  try{const query=new URLSearchParams({versionId,stepId});const res=await fetch(`${action}?${query}`,{headers:{Authorization:`Bearer ${authClient.getToken()||''}`}});const result=await res.json().catch(()=>({}));if(!res.ok)throw new Error(result.error?.message||'Could not review waiver scope.');if(countField)countField.value=String(result.affectedCount);if(output)output.textContent=`${result.affectedCount} active enrollment(s) will be affected · ${result.scope}.`;if(button)button.disabled=result.affectedCount===0;}
  catch(error:any){if(countField)countField.value='0';if(output)output.textContent=error.message;if(button)button.disabled=true;}
});

document.addEventListener('click', (e) => {
  const retry=(e.target as HTMLElement).closest('[data-admin-retry]');
  if(retry){renderApp(window.location.pathname+window.location.search);return;}
  const hintTrigger = (e.target as HTMLElement).closest('.hint-trigger') as HTMLButtonElement | null;
  if (hintTrigger) {
    const isExpanded = hintTrigger.getAttribute('aria-expanded') === 'true';
    const accordion = hintTrigger.closest('.hint-accordion');
    const content = accordion?.querySelector('.hint-content') as HTMLElement | null;
    const chevron = hintTrigger.querySelector('.hint-chevron');

    if (isExpanded) {
      hintTrigger.setAttribute('aria-expanded', 'false');
      if (content) content.hidden = true;
      if (chevron) chevron.textContent = '▼';
    } else {
      hintTrigger.setAttribute('aria-expanded', 'true');
      if (content) content.hidden = false;
      if (chevron) chevron.textContent = '▲';
      const nextHint = accordion?.nextElementSibling as HTMLElement | null;
      if (nextHint?.classList.contains('hint-accordion')) nextHint.hidden = false;

      // Telemetry on actual validated reveal: only record once per hint reveal to prevent fabricated duplicate analytics
      if (!hintTrigger.hasAttribute('data-revealed')) {
        hintTrigger.setAttribute('data-revealed', 'true');
        const enrollmentId = hintTrigger.getAttribute('data-enrollment-id') || hintTrigger.closest('[data-enrollment-id]')?.getAttribute('data-enrollment-id');
        const stepId = hintTrigger.getAttribute('data-step-id') || hintTrigger.closest('[data-step-id]')?.getAttribute('data-step-id');
        const hintIndex = Number(hintTrigger.getAttribute('data-hint-index'));
        if (enrollmentId && stepId && !isNaN(hintIndex)) {
          courseClient.revealHint(enrollmentId, stepId, hintIndex).catch((err) => {
            console.warn('Failed to record hint reveal event', err);
          });
        }
      }
    }
    return;
  }

  const target = (e.target as HTMLElement).closest('a');
  if (target && target.href && !target.hasAttribute('download') && target.origin === window.location.origin) {
    const pathname = target.pathname;
    if (pathname.startsWith('/api/')) return; // Allow direct API endpoints
    if (pathname === '/sign-out') {
      e.preventDefault();
      const user = authClient.getUser();
      void (async () => {
        if (user && !await confirmUnsyncedSignOut(user.id)) return;
        await authClient.signOut();
        navigateTo('/sign-in');
      })();
      return;
    }

    e.preventDefault();
    navigateTo(pathname + target.search);
  }
});

window.addEventListener('popstate', () => {
  renderApp();
});

// Initial paint
renderApp();
