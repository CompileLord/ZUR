import type { CourseBuilderPageOptions, LessonSummary, ModuleSummary, StepSummary } from './CourseBuilderTypes.ts';

export function renderCourseBuilderInspector(opts: CourseBuilderPageOptions, selectedType: string, selectedId: string): string | undefined {
  let inspectorContent: string | undefined = undefined;

  if (selectedType === 'module') {
    const currentMod = opts.modules.find((m) => m.id === selectedId);
    if (currentMod) {
      const modStepCount = currentMod.lessons.reduce((acc, l) => acc + l.steps.length, 0);
      const modDuration = currentMod.lessons.reduce(
        (acc, l) => acc + l.steps.reduce((sAcc, s) => sAcc + (s.estimatedDurationMinutes || 0), 0),
        0
      );
      inspectorContent = `
        <div class="inspector-box p-4">
          <div class="inspector-header mb-3">
            <span class="text-xs text-secondary font-medium">Module overview</span>
            <h3 class="inspector-title text-base font-semibold mt-0.5">${currentMod.title}</h3>
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Module Scope</span>
            <ul class="text-sm text-secondary mt-1" style="list-style: none; padding-left: 0; display: flex; flex-direction: column; gap: 0.25rem;">
              <li><strong>${currentMod.lessons.length}</strong> lessons</li>
              <li><strong>${modStepCount}</strong> steps</li>
              <li><strong>~${modDuration}</strong> minutes</li>
            </ul>
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Actions</span>
            <div class="action-links mt-2" style="display: flex; flex-direction: column; gap: 0.5rem;">
              <a href="/teach/${opts.courseId}/content" class="btn btn-secondary btn-compact" style="width: 100%; text-align: center;">Back to Course</a>
            </div>
          </div>
        </div>
      `;
    }
  } else if (selectedType === 'lesson') {
    let curLes: LessonSummary | null = null;
    let curMod: ModuleSummary | null = null;
    for (const m of opts.modules) {
      const found = m.lessons.find((l) => l.id === selectedId);
      if (found) {
        curLes = found;
        curMod = m;
        break;
      }
    }
    if (curLes) {
      const lesDuration = curLes.steps.reduce((acc, s) => acc + (s.estimatedDurationMinutes || 0), 0);
      const requiredCount = curLes.steps.filter((s) => s.isRequired).length;
      inspectorContent = `
        <div class="inspector-box p-4">
          <div class="inspector-header mb-3">
            <span class="text-xs text-secondary font-medium">Lesson details</span>
            <h3 class="inspector-title text-base font-semibold mt-0.5">${curLes.title}</h3>
            ${curMod ? `<span class="text-xs text-secondary" style="display: block; margin-top: 0.25rem;">Module: ${curMod.title}</span>` : ''}
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Lesson Capacity</span>
            <div class="mt-1 text-sm font-semibold">${curLes.steps.length} / 20 steps</div>
            <span class="text-xs text-secondary">${20 - curLes.steps.length} steps remaining</span>
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Requirements &amp; Duration</span>
            <ul class="text-sm text-secondary mt-1" style="list-style: none; padding-left: 0; display: flex; flex-direction: column; gap: 0.25rem;">
              <li><strong>${requiredCount}</strong> required steps</li>
              <li><strong>${curLes.steps.length - requiredCount}</strong> optional steps</li>
              <li><strong>~${lesDuration}</strong> minutes estimated</li>
            </ul>
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Actions</span>
            <div class="action-links mt-2" style="display: flex; flex-direction: column; gap: 0.5rem;">
              ${curMod ? `<a href="/teach/${opts.courseId}/content?type=module&id=${curMod.id}" class="btn btn-secondary btn-compact" style="width: 100%; text-align: center;">View Module</a>` : ''}
              <a href="/teach/${opts.courseId}/content" class="btn btn-secondary btn-compact" style="width: 100%; text-align: center;">Course Overview</a>
            </div>
          </div>
        </div>
      `;
    }
  } else if (selectedType === 'step') {
    let curStep: StepSummary | null = null;
    for (const m of opts.modules) {
      for (const l of m.lessons) {
        const found = l.steps.find((s) => s.id === selectedId);
        if (found) {
          curStep = found;
          break;
        }
      }
    }
    if (curStep) {
      const editUrl =
        curStep.type === 'theory'
          ? `/teach/${opts.courseId}/content/theory/${curStep.id}`
          : curStep.type === 'video'
          ? `/teach/${opts.courseId}/content/video/${curStep.id}`
          : curStep.type === 'quiz'
          ? `/teach/${opts.courseId}/content/quiz/${curStep.id}`
          : `/teach/${opts.courseId}/content/python/${curStep.id}`;

      inspectorContent = `
        <div class="inspector-box p-4">
          <div class="inspector-header mb-3">
            <span class="text-xs text-secondary font-medium">Step settings</span>
            <h3 class="inspector-title text-base font-semibold mt-0.5">${curStep.title}</h3>
            <span class="status-badge neutral mt-1" style="text-transform: capitalize;">${curStep.type}</span>
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Completion Requirement</span>
            <div class="mt-1">
              <span class="status-badge ${curStep.isRequired ? 'badge-primary' : 'badge-neutral'}">${curStep.isRequired ? 'Required step' : 'Optional step'}</span>
            </div>
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Estimated Duration</span>
            <div class="mt-1 text-sm font-semibold">${curStep.estimatedDurationMinutes} minutes</div>
          </div>
          <div class="inspector-section mb-4">
            <span class="field-label text-xs text-secondary">Actions</span>
            <div class="action-links mt-2" style="display: flex; flex-direction: column; gap: 0.5rem;">
              <a href="${editUrl}" class="btn btn-primary btn-compact" style="width: 100%; text-align: center;">Open Editor</a>
              <a href="/teach/${opts.courseId}/preview/${curStep.id}" class="btn btn-secondary btn-compact" style="width: 100%; text-align: center;">Preview Step</a>
            </div>
          </div>
        </div>
      `;
    }
  }
  return inspectorContent;
}
