import { renderMarkdownToHtml } from 'zur-shared';
import { initAuthorTree, fetchInvalidStepIds, applyInvalidStepDots } from '../../pages/author/AuthorTreeComponent.ts';
import { s2Request } from '../api.ts';
import { s2Current } from '../helpers.ts';
import { hydrateDeferredAssets } from '../lesson-media.ts';
import { renderApp, navigateTo } from '../navigation.ts';
import { attachTheoryAssetModal, attachCheckReferenceSolution } from './author-step-editor-extras.ts';
import { appEl } from '../state.ts';
import { renderSaveConflict } from '../../pages/author/SaveConflict.ts';

export async function loadStepEditorPage(path: string, params: Record<string, string>, courseId: string, course: any, tree: any): Promise<void> {
  const step = tree.modules.flatMap((m: any) => m.lessons.flatMap((l: any) => l.steps)).find((s: any) => s.id === params.stepId);
  if (!step) throw new Error("This step isn't available.");
  const detail = await s2Request(`/api/author/steps/${step.id}/content`);
  const specialized = step.type === 'quiz' ? await s2Request(`/api/author/steps/${step.id}/quiz`) : step.type === 'python' ? await s2Request(`/api/author/steps/${step.id}/python`) : null;
  if (!s2Current(path)) return;
  const base = { courseId, courseTitle: course.title, publicationState: course.publicationStatus, hasUnpublishedChanges: course.hasUnpublishedChanges, stepId: step.id, stepTitle: detail.title, revision: detail.revision, isRequired: detail.isRequired, estimatedDurationMinutes: detail.estimatedDurationMinutes, modules: tree.modules };
  const c = specialized ? (step.type === 'quiz' ? specialized.quiz : specialized) : detail.content || {};
  if (step.type === 'theory') {
    const { renderTheoryEditorPage } = await import('../../pages/author/TheoryEditorPage.ts');
    appEl.innerHTML = renderTheoryEditorPage({ ...base, markdown: c.markdown || '' });
    void hydrateDeferredAssets(appEl);
    const { initTheoryEditor } = await import('../../pages/author/TheoryEditorPage.ts');
    initTheoryEditor(appEl, renderMarkdownToHtml, () => { void hydrateDeferredAssets(appEl); });

    attachTheoryAssetModal(courseId);
  }
  else if (step.type === 'video') {
    const { renderVideoEditorPage } = await import('../../pages/author/VideoEditorPage.ts');
    appEl.innerHTML = renderVideoEditorPage({ ...base, videoUrl: c.videoUrl || '', provider: c.provider || 'youtube', transcript: c.transcript || '', captionVerified: Boolean(c.captionVerified) });
  }
  else if (step.type === 'quiz') {
    const { renderQuizEditorPage } = await import('../../pages/author/QuizEditorPage.ts');
    appEl.innerHTML = renderQuizEditorPage({ ...base, quizType: c.quizType || 'single_choice', prompt: c.prompt || '', options: c.options || [], explanation: c.explanation || '' });
  }
  else {
    const { renderPythonExerciseEditorPage } = await import('../../pages/author/PythonExerciseEditorPage.ts');
    appEl.innerHTML = renderPythonExerciseEditorPage({ ...base, problemStatement: c.problemStatement || '', inputFormat: c.inputFormat || '', outputFormat: c.outputFormat || '', constraints: c.constraints || '', starterCode: c.starterCode || '', referenceSolution: c.referenceSolution || '', hints: c.hints || [], solutionExplanation: c.solutionExplanation || '', publicTests: c.publicTests || [], hiddenTests: c.hiddenTests || [], runtimeLimits: c.runtimeLimits || { cpuTimeoutSeconds: 2, wallTimeoutSeconds: 5, memoryLimitMib: 128 } });
  }
  {
    
    initAuthorTree(appEl, { courseId, request: (route, method, body) => s2Request(route, method, body), refresh: () => renderApp(path), navigate: (url) => navigateTo(url) });
    
    void fetchInvalidStepIds(s2Request, courseId).then((ids) => { if (s2Current(path)) applyInvalidStepDots(appEl, ids); });
  }
  if (step.type === 'quiz') {
    const { initQuizEditor } = await import('../../pages/author/QuizEditorPage.ts');
    initQuizEditor(appEl);
  }
  if (step.type === 'python') {
    const { initPythonExerciseEditor } = await import('../../pages/author/PythonExerciseEditorPage.ts');
    initPythonExerciseEditor(appEl);

    attachCheckReferenceSolution(step);
  }
  attachAuthorStepSave(step, detail, c);
  return;
}

export function attachAuthorStepSave(step: any, detail: any, c: any): void {
  const saveButton = document.createElement('button');
  saveButton.type = 'button'; saveButton.className = 'btn btn-primary btn-compact'; saveButton.textContent = 'Save changes';
  appEl.querySelector('.author-header-right')?.prepend(saveButton);
  const authorShell = appEl.querySelector('.shell-author') as HTMLElement;
  let authorEditRevision = 0;
  authorShell.addEventListener('input', () => { authorEditRevision++; authorShell.classList.add('is-dirty'); });
  authorShell.addEventListener('change', () => { authorEditRevision++; authorShell.classList.add('is-dirty'); });
  const saveAuthorStep = async (): Promise<boolean> => {
    if (saveButton.disabled) return false;
    const savingEditRevision = authorEditRevision;
    const value = (id: string) => (appEl.querySelector(`#${id}`) as HTMLInputElement | HTMLTextAreaElement | null)?.value || '';
    const checked = (id: string) => Boolean((appEl.querySelector(`#${id}`) as HTMLInputElement | null)?.checked);
    const stepMeta = { title: value('step-title-input'), isRequired: checked('step-required'), estimatedDurationMinutes: Number(value('step-duration')) || detail.estimatedDurationMinutes };
    let payload: any = { ...c, kind: step.type };
    if (step.type === 'theory') payload.markdown = value('theory-markdown-input');
    if (step.type === 'video') payload = { ...payload, videoUrl: value('video-url-input'), transcript: value('video-transcript-input'), captionVerified: checked('caption-verified'), provider: value('video-url-input').includes('vimeo.com') ? 'vimeo' : 'youtube' };
    if (step.type === 'quiz') {
      payload = { ...payload, quizType: value('quiz-type-select'), prompt: value('quiz-prompt-input'), explanation: value('quiz-explanation-input'), options: Array.from(appEl.querySelectorAll('.quiz-option-row')).map(row => ({ id: (row as HTMLElement).dataset.optionId, text: (row.querySelector('.option-text-input') as HTMLInputElement)?.value || '', isCorrect: Boolean((row.querySelector('.correct-input') as HTMLInputElement)?.checked) })) };
    }
    if (step.type === 'python') {
      const sections = appEl.querySelectorAll('#tab-tests .test-cases-section');
      const readTests = (section: Element | undefined) => Array.from(section?.querySelectorAll('.test-case-card') || []).map(row => ({ stdin: (row.querySelector('.test-stdin') as HTMLTextAreaElement).value, expectedStdout: (row.querySelector('.test-stdout') as HTMLTextAreaElement).value }));
      const hints = Array.from(appEl.querySelectorAll<HTMLInputElement>('.hint-input'))
        .map(i => i.value.trim())
        .filter(Boolean);
      payload = { ...payload, hints, problemStatement: value('problem-stmt-input'), inputFormat: value('input-format-input'), outputFormat: value('output-format-input'), constraints: value('constraints-input'), starterCode: value('starter-code-input'), referenceSolution: value('ref-solution-input'), solutionExplanation: value('explanation-input'), publicTests: readTests(sections[0]), hiddenTests: readTests(sections[1]), runtimeLimits: { cpuTimeoutSeconds: Number(value('cpu-timeout')) || 2, wallTimeoutSeconds: Number(value('wall-timeout')) || 5, memoryLimitMib: Number(value('memory-limit')) || 128 } };
    }
    saveButton.disabled = true; saveButton.textContent = 'Saving…';
    try {
      const endpoint = step.type === 'quiz' ? `/api/author/steps/${step.id}/quiz` : step.type === 'python' ? `/api/author/steps/${step.id}/python` : `/api/author/steps/${step.id}/content`;
      const body = step.type === 'quiz' ? { expectedRevision: detail.revision, quiz: payload } : step.type === 'python' ? { expectedRevision: detail.revision, exercise: { ...payload, title: stepMeta.title } } : { expectedRevision: detail.revision, payload, stepMeta };
      const result = await s2Request(endpoint, 'PUT', body);
      detail.revision = result.revision; Object.assign(c, payload);
      const stillClean = savingEditRevision === authorEditRevision;
      saveButton.textContent = stillClean ? 'Saved' : 'Save changes';
      if (stillClean) authorShell.classList.remove('is-dirty');
      const existingBanner = authorShell.querySelector('.author-save-error-banner');
      if (existingBanner) existingBanner.remove();
      return stillClean;
    } catch (err: any) {
      saveButton.textContent = 'Retry save';
      let banner = authorShell.querySelector('.author-save-error-banner') as HTMLElement | null;
      if (!banner) {
        banner = document.createElement('div');
        banner.className = 'author-save-error-banner alert alert-danger mt-2';
        banner.setAttribute('role', 'alert');
        const container = authorShell.querySelector('.theory-editor-container, .video-editor-container, .quiz-editor-container, .exercise-editor-container, .author-editor-pane');
        if (container) {
          container.prepend(banner);
        } else {
          authorShell.prepend(banner);
        }
      }
      const isConflict = err?.status === 409 || err?.statusCode === 409 || err?.code === 'CONFLICT' || err?.message?.toLowerCase().includes('conflict');
      if (isConflict) {
        banner.innerHTML = renderSaveConflict();
        banner.querySelector('[data-conflict-action="reload"]')?.addEventListener('click', () => {
          authorShell.classList.remove('is-dirty');
          renderApp();
        });
        banner.querySelector('[data-conflict-action="overwrite"]')?.addEventListener('click', async () => {
          const latest = await s2Request(`/api/author/steps/${step.id}/content`);
          detail.revision = latest.revision;
          await saveAuthorStep();
        });
      } else {
        banner.textContent = `Save failed: ${err.message || 'Service temporarily unavailable. Click Retry save to try again.'}`;
      }
      return false;
    }
    finally { saveButton.disabled = false; }
  };
  saveButton.addEventListener('click', () => { void saveAuthorStep(); });
  authorShell.addEventListener('click', async event => {
    const link = (event.target as HTMLElement).closest<HTMLAnchorElement>('a[href]');
    if (!link || !authorShell.classList.contains('is-dirty') || link.target === '_blank' || link.hasAttribute('download')) return;
    const target = new URL(link.href, window.location.href);
    if (target.origin !== window.location.origin || target.pathname === window.location.pathname && target.search === window.location.search) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const originPath = window.location.pathname + window.location.search;
    const saved = await saveAuthorStep();
    if (saved && authorShell.isConnected && s2Current(originPath)) {
      navigateTo(target.pathname + target.search + target.hash);
    }
  }, true);
}
