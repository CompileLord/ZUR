import { safeTemplateData } from '../../utils/safe-template-data.ts';
import { renderAuthorWorkspaceShell } from '../../components/shells/AuthorWorkspaceShell.ts';

export interface CourseSettingsData {
  id: string;
  title: string;
  description: string;
  categoryId: string;
  categoryName?: string;
  tags: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  language: string;
  learningOutcomes: string[];
  prerequisites: string;
  estimatedDurationMinutes: number;
  visibility: 'public' | 'unlisted' | 'private';
  enrollmentPolicy: 'open' | 'invitation_only';
  publicationStatus: 'draft' | 'published' | 'archived';
  draftRevision: number;
  hasUnpublishedChanges?: boolean;
  currentVersionId?: string | null;
  versions?: Array<{ id: string; versionNumber: number; publishedAt: string }>;
}

export interface CourseSettingsPageOptions {
  course: CourseSettingsData;
  categories: Array<{ id: string; name: string }>;
  saveStatus?: 'saved' | 'saving' | 'unsaved' | 'conflict';
  saveMessage?: string;
  errorMessage?: string;
}

export function renderCourseSettingsPage(opts: CourseSettingsPageOptions): string {
  opts = safeTemplateData(opts);
  const c = opts.course;
  const isPrivate = c.visibility === 'private';
  const neverPublished = !c.currentVersionId && (!c.versions || c.versions.length === 0);

  const saveStatusText =
    opts.saveStatus === 'saving'
      ? 'Saving metadata...'
      : opts.saveStatus === 'unsaved'
      ? 'Unsaved changes'
      : opts.saveStatus === 'conflict'
      ? 'Revision conflict'
      : undefined;

  const editorContent = `
    <div class="settings-form-wrapper settings-layout">
      <header class="settings-header mb-6 pb-4 border-b border-subtle">
        <h1 class="page-title text-2xl font-bold">Course settings</h1>
      </header>

      <nav class="settings-rail" aria-label="Course settings sections">
        <a href="#basics" class="settings-rail-link" data-settings-link="basics">Basics</a>
        <a href="#catalog" class="settings-rail-link" data-settings-link="catalog">Catalog</a>
        <a href="#enrollment" class="settings-rail-link" data-settings-link="enrollment">Enrollment</a>
        <a href="#versions" class="settings-rail-link" data-settings-link="versions">Versions</a>
        <a href="#lifecycle" class="settings-rail-link settings-rail-danger" data-settings-link="lifecycle">Lifecycle</a>
      </nav>

      <div class="settings-main">
      ${opts.errorMessage ? `<div class="alert alert-danger mb-6 p-3 border border-danger rounded text-sm" role="alert">${opts.errorMessage}</div>` : ''}
      ${opts.saveMessage ? `<div class="alert alert-success mb-6 p-3 border border-success rounded text-sm text-success" role="alert">${opts.saveMessage}</div>` : ''}

      <form class="metadata-form" method="POST" action="/teach/${c.id}/settings/metadata">
        <input type="hidden" name="expectedRevision" value="${c.draftRevision}" />

        <!-- Section 1: Basics -->
        <section class="settings-section settings-two-col grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 mb-8 pb-8 border-b border-subtle" aria-labelledby="basics-heading" data-settings-section="basics">
          <div class="settings-col-meta">
            <h2 id="basics-heading" class="settings-col-title text-base font-semibold text-primary">Basics</h2>
            <p class="settings-col-desc text-xs text-secondary mt-1">Core course title, summary, and learning prerequisites.</p>
          </div>
          <div class="settings-col-content space-y-4 max-w-xl">
            <div class="form-group">
              <label for="course-title" class="field-label text-xs font-semibold block mb-1">Course title</label>
              <input
                id="course-title"
                name="title"
                type="text"
                class="text-input w-full"
                value="${c.title}"
                required
                maxlength="200"
              />
            </div>

            <div class="form-group">
              <label for="course-desc" class="field-label text-xs font-semibold block mb-1">Course description</label>
              <textarea
                id="course-desc"
                name="description"
                class="textarea-input w-full"
                rows="4"
                placeholder="What will students learn in this course?"
              >${c.description}</textarea>
            </div>

            <div class="form-group">
              <label for="course-outcomes" class="field-label text-xs font-semibold block mb-1">Learning outcomes (one per line)</label>
              <textarea
                id="course-outcomes"
                name="learningOutcomes"
                class="textarea-input w-full"
                rows="3"
                placeholder="Write Python programs using functions\nDebug common syntax and runtime errors"
              >${c.learningOutcomes.join('\n')}</textarea>
            </div>

            <div class="form-group">
              <label for="course-prereqs" class="field-label text-xs font-semibold block mb-1">Prerequisites</label>
              <textarea
                id="course-prereqs"
                name="prerequisites"
                class="textarea-input w-full"
                rows="2"
                placeholder="Basic familiarity with computer navigation"
              >${c.prerequisites}</textarea>
            </div>
          </div>
        </section>

        <!-- Section 2: Catalog & Classification -->
        <section class="settings-section settings-two-col grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 mb-8 pb-8 border-b border-subtle" aria-labelledby="catalog-heading" data-settings-section="catalog">
          <div class="settings-col-meta">
            <h2 id="catalog-heading" class="settings-col-title text-base font-semibold text-primary">Catalog</h2>
            <p class="settings-col-desc text-xs text-secondary mt-1">Categorization, difficulty rating, search tags, and estimated duration.</p>
          </div>
          <div class="settings-col-content space-y-4 max-w-xl">
            <div class="form-row grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="form-group">
                <label for="course-category" class="field-label text-xs font-semibold block mb-1">Category</label>
                <select id="course-category" name="categoryId" class="select-input w-full">
                  ${opts.categories
                    .map(
                      (cat) =>
                        `<option value="${cat.id}" ${cat.id === c.categoryId ? 'selected' : ''}>${cat.name}</option>`
                    )
                    .join('')}
                </select>
              </div>

              <div class="form-group">
                <label for="course-difficulty" class="field-label text-xs font-semibold block mb-1">Difficulty</label>
                <select id="course-difficulty" name="difficulty" class="select-input w-full">
                  <option value="beginner" ${c.difficulty === 'beginner' ? 'selected' : ''}>Beginner</option>
                  <option value="intermediate" ${c.difficulty === 'intermediate' ? 'selected' : ''}>Intermediate</option>
                  <option value="advanced" ${c.difficulty === 'advanced' ? 'selected' : ''}>Advanced</option>
                </select>
              </div>
            </div>

            <div class="form-row grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div class="form-group">
                <label for="course-tags" class="field-label text-xs font-semibold block mb-1">Tags (up to 5, comma-separated)</label>
                <input
                  id="course-tags"
                  name="tags"
                  type="text"
                  class="text-input w-full"
                  value="${c.tags.join(', ')}"
                  placeholder="python, algorithms, beginner"
                />
                <p class="field-hint text-xs text-muted mt-1">Tags will be normalized to lowercase.</p>
              </div>

              <div class="form-group">
                <label for="course-duration" class="field-label text-xs font-semibold block mb-1">Estimated duration (minutes)</label>
                <input
                  id="course-duration"
                  name="estimatedDurationMinutes"
                  type="number"
                  min="0"
                  class="text-input w-full"
                  value="${c.estimatedDurationMinutes}"
                />
              </div>
            </div>
          </div>
        </section>

        <!-- Sticky Save Bar for Metadata -->
        <div class="sticky-save-bar sticky bottom-4 z-10 p-3 bg-surface border border-subtle shadow-md flex justify-between items-center rounded-lg mb-8">
          <span class="text-xs text-secondary">Draft metadata is saved to this working copy.</span>
          <button type="submit" class="btn btn-primary btn-compact">Save course metadata</button>
        </div>
      </form>

      <!-- Section 3: Discoverability and Delivery Settings (Live) -->
      <section class="settings-section settings-two-col grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 mb-8 pb-8 border-b border-subtle" aria-labelledby="delivery-heading" data-settings-section="enrollment">
        <div class="settings-col-meta">
          <h2 id="delivery-heading" class="settings-col-title text-base font-semibold text-primary">Discoverability &amp; enrollment</h2>
          <p class="settings-col-desc text-xs text-secondary mt-1">Live settings controlling visibility and access policies. Applied immediately.</p>
        </div>
        <div class="settings-col-content space-y-4 max-w-xl">
          <form class="access-form" method="POST" action="/teach/${c.id}/settings/access">
            <div class="form-group mb-4">
              <fieldset class="radio-fieldset">
                <legend class="option-legend">Visibility</legend>
                <div class="option-card-list">
                  <label class="radio-label option-card">
                    <input type="radio" name="visibility" value="private" ${isPrivate ? 'checked' : ''} />
                    <span class="option-text"><strong>Private</strong><span class="option-desc">visible only to course owners, admins, and enrolled learners</span></span>
                  </label>
                  <label class="radio-label option-card">
                    <input type="radio" name="visibility" value="unlisted" ${c.visibility === 'unlisted' ? 'checked' : ''} />
                    <span class="option-text"><strong>Unlisted</strong><span class="option-desc">accessible by direct link; hidden from catalog and search</span></span>
                  </label>
                  <label class="radio-label option-card">
                    <input type="radio" name="visibility" value="public" ${c.visibility === 'public' ? 'checked' : ''} />
                    <span class="option-text"><strong>Public</strong><span class="option-desc">featured in course catalog and accessible to all students</span></span>
                  </label>
                </div>
              </fieldset>
            </div>

            <div class="form-group mb-4">
              <fieldset class="radio-fieldset">
                <legend class="option-legend">Enrollment policy</legend>
                <div class="option-card-list">
                  <label class="radio-label option-card ${isPrivate ? 'is-disabled' : ''}">
                    <input
                      type="radio"
                      name="enrollmentPolicy"
                      value="open"
                      ${c.enrollmentPolicy === 'open' && !isPrivate ? 'checked' : ''}
                      ${isPrivate ? 'disabled' : ''}
                    />
                    <span class="option-text"><strong>Open</strong><span class="option-desc">any registered learner can join directly</span></span>
                  </label>
                  <label class="radio-label option-card">
                    <input
                      type="radio"
                      name="enrollmentPolicy"
                      value="invitation_only"
                      ${c.enrollmentPolicy === 'invitation_only' || isPrivate ? 'checked' : ''}
                    />
                    <span class="option-text"><strong>Invitation only</strong><span class="option-desc">learners require an invite token to join</span></span>
                  </label>
                </div>
                ${isPrivate ? '<p class="field-hint text-warning text-xs mt-2">Private courses automatically enforce invitation-only enrollment.</p>' : ''}
              </fieldset>
            </div>

            <div class="action-row pt-2">
              <button type="submit" class="btn btn-secondary btn-compact">Apply access settings</button>
            </div>
          </form>
        </div>
      </section>

      <!-- Section 4: Publication & Version Information -->
      <section class="settings-section settings-two-col grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6 mb-8 pb-8 border-b border-subtle" aria-labelledby="versions-heading" data-settings-section="versions">
        <div class="settings-col-meta">
          <h2 id="versions-heading" class="settings-col-title text-base font-semibold text-primary">Publication &amp; versions</h2>
          <p class="settings-col-desc text-xs text-secondary mt-1">History of published releases and student version pinning.</p>
        </div>
        <div class="settings-col-content max-w-xl">
          ${
            c.versions && c.versions.length > 0
              ? `
                <ul class="version-list space-y-2" role="list">
                  ${c.versions
                    .map(
                      (v) => `
                      <li class="version-item flex items-center justify-between p-2.5 bg-surface border border-subtle rounded-md text-sm">
                        <span class="version-badge font-mono text-xs font-semibold px-2 py-0.5 rounded bg-raised border border-subtle">Version ${v.versionNumber}</span>
                        <span class="version-date text-xs text-muted">Published on ${new Date(v.publishedAt).toLocaleDateString()}</span>
                      </li>
                    `
                    )
                    .join('')}
                </ul>
              `
              : '<p class="text-secondary text-sm">No published versions yet. This course is currently a private draft.</p>'
          }
        </div>
      </section>

      <!-- Section 5: Danger Zone -->
      <section class="settings-section danger-zone settings-two-col grid grid-cols-1 md:grid-cols-[240px_1fr] gap-6" aria-labelledby="danger-heading" data-settings-section="lifecycle">
        <div class="settings-col-meta">
          <h2 id="danger-heading" class="settings-col-title text-base font-semibold text-danger">Course lifecycle</h2>
          <p class="settings-col-desc text-xs text-secondary mt-1">Irreversible and restrictive lifecycle operations.</p>
        </div>
        <div class="settings-col-content max-w-xl space-y-4">
          <div class="danger-box p-4 bg-surface border border-subtle rounded-lg space-y-4">
            <div class="danger-row flex items-center justify-between gap-4">
              <div>
                <strong class="text-sm">${c.publicationStatus === 'archived' ? 'Restore course' : 'Archive course'}</strong>
                <p class="field-hint text-xs text-muted mt-0.5">${c.publicationStatus === 'archived' ? 'Restore this course to allow new enrollments again.' : 'Stop new enrollments; current students can continue.'}</p>
              </div>
              <form method="POST" action="/teach/${c.id}/settings/${c.publicationStatus === 'archived' ? 'restore' : 'archive'}" data-course-lifecycle="${c.publicationStatus === 'archived' ? 'restore' : 'archive'}" class="flex-shrink-0">
                <button type="submit" class="btn btn-secondary btn-compact">${c.publicationStatus === 'archived' ? 'Restore course' : 'Archive course'}</button>
              </form>
            </div>

            ${
              neverPublished && c.publicationStatus === 'draft'
                ? `
                  <hr class="border-subtle" />
                  <div class="danger-row flex items-center justify-between gap-4">
                    <div>
                      <strong class="text-sm text-danger">Delete course draft</strong>
                      <p class="field-hint text-xs text-muted mt-0.5">Permanently delete this unpublished draft and all its lessons.</p>
                    </div>
                    <form method="POST" action="/teach/${c.id}/settings/delete" data-course-lifecycle="delete" class="flex-shrink-0">
                      <button type="submit" class="btn btn-destructive btn-compact">Delete draft</button>
                    </form>
                  </div>
                `
                : ''
            }
          </div>
        </div>
      </section>
      </div>
    </div>
  `;

  return renderAuthorWorkspaceShell({
    courseId: c.id,
    courseTitle: c.title,
    publicationState: c.publicationStatus,
    hasUnpublishedChanges: c.hasUnpublishedChanges ?? (c.draftRevision > 1),
    saveStatusText,
    activeTab: 'settings',
    editorContent,
  });
}

const SETTINGS_SECTIONS = ['basics', 'catalog', 'enrollment', 'versions', 'lifecycle'];
const LEGACY_HASHES: Record<string, string> = {
  'basics-heading': 'basics', 'catalog-heading': 'catalog', 'delivery-heading': 'enrollment',
  'versions-heading': 'versions', 'danger-heading': 'lifecycle',
};

/** Shows one settings section at a time, synced to the URL hash so deep links work. */
export function initSettingsSections(root: ParentNode): void {
  const layout = root.querySelector<HTMLElement>('.settings-layout');
  if (!layout) return;
  const show = (raw: string) => {
    const id = SETTINGS_SECTIONS.includes(raw) ? raw : LEGACY_HASHES[raw] || 'basics';
    layout.querySelectorAll<HTMLElement>('[data-settings-section]').forEach((s) => { s.hidden = s.dataset.settingsSection !== id; });
    layout.querySelectorAll<HTMLElement>('[data-settings-link]').forEach((a) => {
      const on = a.dataset.settingsLink === id;
      a.classList.toggle('active', on);
      if (on) a.setAttribute('aria-current', 'true'); else a.removeAttribute('aria-current');
    });
  };
  layout.querySelectorAll<HTMLAnchorElement>('[data-settings-link]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    e.stopPropagation();
    history.replaceState(history.state, '', `${window.location.pathname}${window.location.search}#${a.dataset.settingsLink}`);
    show(a.dataset.settingsLink!);
  }));
  const onHash = () => {
    if (!layout.isConnected) { window.removeEventListener('hashchange', onHash); return; }
    show(window.location.hash.slice(1));
  };
  window.addEventListener('hashchange', onHash);
  show(window.location.hash.slice(1));
}
