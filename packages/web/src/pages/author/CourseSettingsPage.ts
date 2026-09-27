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
      : 'Saved';

  const editorContent = `
    <div class="settings-form-wrapper" style="max-width: 640px; margin: 0 auto; padding: 2rem 1rem;">
      <header class="settings-header">
        <h1 class="page-title">Course settings</h1>
        <p class="text-secondary">Configure metadata, delivery settings, and access policies.</p>
      </header>

      ${opts.errorMessage ? `<div class="alert alert-danger" role="alert">${opts.errorMessage}</div>` : ''}
      ${opts.saveMessage ? `<div class="alert alert-success" role="alert">${opts.saveMessage}</div>` : ''}

      <!-- Section 1: Basics -->
      <section class="settings-section" aria-labelledby="basics-heading">
        <h2 id="basics-heading" class="section-title">Basics</h2>
        <form class="metadata-form" method="POST" action="/teach/${c.id}/settings/metadata">
          <input type="hidden" name="expectedRevision" value="${c.draftRevision}" />

          <div class="form-group">
            <label for="course-title" class="field-label">Course title</label>
            <input
              id="course-title"
              name="title"
              type="text"
              class="text-input"
              value="${c.title}"
              required
              maxlength="200"
            />
          </div>

          <div class="form-group">
            <label for="course-desc" class="field-label">Course description</label>
            <textarea
              id="course-desc"
              name="description"
              class="textarea-input"
              rows="4"
              placeholder="What will students learn in this course?"
            >${c.description}</textarea>
          </div>

          <div class="form-row">
            <div class="form-group col-half">
              <label for="course-category" class="field-label">Category</label>
              <select id="course-category" name="categoryId" class="select-input">
                ${opts.categories
                  .map(
                    (cat) =>
                      `<option value="${cat.id}" ${cat.id === c.categoryId ? 'selected' : ''}>${cat.name}</option>`
                  )
                  .join('')}
              </select>
            </div>

            <div class="form-group col-half">
              <label for="course-difficulty" class="field-label">Difficulty</label>
              <select id="course-difficulty" name="difficulty" class="select-input">
                <option value="beginner" ${c.difficulty === 'beginner' ? 'selected' : ''}>Beginner</option>
                <option value="intermediate" ${c.difficulty === 'intermediate' ? 'selected' : ''}>Intermediate</option>
                <option value="advanced" ${c.difficulty === 'advanced' ? 'selected' : ''}>Advanced</option>
              </select>
            </div>
          </div>

          <div class="form-row">
            <div class="form-group col-half">
              <label for="course-tags" class="field-label">Tags (up to 5, comma-separated)</label>
              <input
                id="course-tags"
                name="tags"
                type="text"
                class="text-input"
                value="${c.tags.join(', ')}"
                placeholder="python, algorithms, beginner"
              />
              <p class="field-hint">Tags will be normalized to lowercase.</p>
            </div>

            <div class="form-group col-half">
              <label for="course-duration" class="field-label">Estimated duration (minutes)</label>
              <input
                id="course-duration"
                name="estimatedDurationMinutes"
                type="number"
                min="0"
                class="text-input"
                value="${c.estimatedDurationMinutes}"
              />
            </div>
          </div>

          <div class="form-group">
            <label for="course-outcomes" class="field-label">Learning outcomes (one per line)</label>
            <textarea
              id="course-outcomes"
              name="learningOutcomes"
              class="textarea-input"
              rows="3"
              placeholder="Write Python programs using functions\nDebug common syntax and runtime errors"
            >${c.learningOutcomes.join('\n')}</textarea>
          </div>

          <div class="form-group">
            <label for="course-prereqs" class="field-label">Prerequisites</label>
            <textarea
              id="course-prereqs"
              name="prerequisites"
              class="textarea-input"
              rows="2"
              placeholder="Basic familiarity with computer navigation"
            >${c.prerequisites}</textarea>
          </div>

          <div class="action-row">
            <button type="submit" class="btn btn-primary">Save course metadata</button>
          </div>
        </form>
      </section>

      <hr class="section-divider" />

      <!-- Section 2: Discoverability and Delivery Settings (Live) -->
      <section class="settings-section" aria-labelledby="delivery-heading">
        <h2 id="delivery-heading" class="section-title">Discoverability & enrollment</h2>
        <p class="text-secondary field-hint">These live settings control course visibility and access policy immediately upon applying.</p>

        <form class="access-form" method="POST" action="/teach/${c.id}/settings/access">
          <div class="form-group">
            <fieldset class="radio-fieldset">
              <legend class="field-label">Visibility</legend>
              <label class="radio-label">
                <input type="radio" name="visibility" value="private" ${isPrivate ? 'checked' : ''} />
                <span><strong>Private</strong> — visible only to course owners, admins, and enrolled learners</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="visibility" value="unlisted" ${c.visibility === 'unlisted' ? 'checked' : ''} />
                <span><strong>Unlisted</strong> — accessible by direct link; hidden from catalog and search</span>
              </label>
              <label class="radio-label">
                <input type="radio" name="visibility" value="public" ${c.visibility === 'public' ? 'checked' : ''} />
                <span><strong>Public</strong> — featured in course catalog and accessible to all students</span>
              </label>
            </fieldset>
          </div>

          <div class="form-group">
            <fieldset class="radio-fieldset">
              <legend class="field-label">Enrollment policy</legend>
              <label class="radio-label ${isPrivate ? 'disabled' : ''}">
                <input
                  type="radio"
                  name="enrollmentPolicy"
                  value="open"
                  ${c.enrollmentPolicy === 'open' && !isPrivate ? 'checked' : ''}
                  ${isPrivate ? 'disabled' : ''}
                />
                <span><strong>Open</strong> — any registered learner can join directly</span>
              </label>
              <label class="radio-label">
                <input
                  type="radio"
                  name="enrollmentPolicy"
                  value="invitation_only"
                  ${c.enrollmentPolicy === 'invitation_only' || isPrivate ? 'checked' : ''}
                />
                <span><strong>Invitation only</strong> — learners require an invite token to join</span>
              </label>
              ${isPrivate ? '<p class="field-hint text-warning">Private courses automatically enforce invitation-only enrollment.</p>' : ''}
            </fieldset>
          </div>

          <div class="action-row">
            <button type="submit" class="btn btn-secondary">Apply access settings</button>
          </div>
        </form>
      </section>

      <hr class="section-divider" />

      <!-- Section 3: Publication & Version Information -->
      <section class="settings-section" aria-labelledby="versions-heading">
        <h2 id="versions-heading" class="section-title">Publication & versions</h2>
        ${
          c.versions && c.versions.length > 0
            ? `
              <ul class="version-list" role="list">
                ${c.versions
                  .map(
                    (v) => `
                    <li class="version-item">
                      <span class="version-badge">Version ${v.versionNumber}</span>
                      <span class="version-date">Published on ${new Date(v.publishedAt).toLocaleDateString()}</span>
                    </li>
                  `
                  )
                  .join('')}
              </ul>
            `
            : '<p class="text-secondary">No published versions yet. This course is currently a private draft.</p>'
        }
      </section>

      <hr class="section-divider" />

      <!-- Section 4: Danger Zone -->
      <section class="settings-section danger-zone" aria-labelledby="danger-heading">
        <h2 id="danger-heading" class="section-title text-danger">Course lifecycle</h2>
        <div class="danger-box">
          <div class="danger-row">
            <div>
              <strong>Archive course</strong>
              <p class="field-hint">Archiving stops new enrollments while allowing current students to complete their coursework.</p>
            </div>
            <form method="POST" action="/teach/${c.id}/settings/archive">
              <button type="submit" class="btn btn-secondary btn-danger-outline">Archive course</button>
            </form>
          </div>

          ${
            neverPublished
              ? `
                <div class="danger-row mt-3">
                  <div>
                    <strong>Delete course draft</strong>
                    <p class="field-hint">Permanently delete this unpublished draft and all its lessons.</p>
                  </div>
                  <form method="POST" action="/teach/${c.id}/settings/delete" onsubmit="return confirm('Permanently delete this course draft?');">
                    <button type="submit" class="btn btn-danger">Delete draft</button>
                  </form>
                </div>
              `
              : ''
          }
        </div>
      </section>
    </div>
  `;

  return renderAuthorWorkspaceShell({
    courseId: c.id,
    courseTitle: c.title,
    publicationState: c.publicationStatus,
    hasUnpublishedChanges: c.draftRevision > 1,
    saveStatusText,
    activeTab: 'settings',
    editorContent,
  });
}
