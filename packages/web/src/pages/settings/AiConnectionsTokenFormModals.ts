import { escapeHtml } from './AiConnectionsFormat.ts';
import type { AuthorCourseOption, ConnectionTokenItem } from './AiConnectionsTypes.ts';

export function renderReplaceTokenModal(token: ConnectionTokenItem, courses: AuthorCourseOption[], error?: string): string {
  const allowedScopes = token.scopes;
  const isAllCourses = token.courseRestrictions === null;
  const restrictedCourses = token.courseRestrictions || [];
  const selectableCourses = courses.filter((c) => isAllCourses || restrictedCourses.includes(c.id));

  return `
    <div id="replace-token-modal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="replace-token-title" style="overflow-y: auto;">
      <div class="modal-dialog" tabindex="-1" style="max-width: 520px; max-height: calc(100vh - 2rem); margin: auto; padding: var(--space-4); display: flex; flex-direction: column;">
        <header class="dialog-header mb-1">
          <h2 id="replace-token-title" class="dialog-title text-base font-semibold">Replace access token</h2>
          <p class="text-xs text-secondary">Reauthenticate to rotate this token. The existing token (${escapeHtml(token.label)}) will be revoked immediately and cannot be reused.</p>
        </header>

        ${error ? `<div id="replace-token-error" class="form-error p-2 text-xs border border-danger rounded" role="alert">${escapeHtml(error)}</div>` : ''}

        <form id="replace-token-form" data-token-id="${escapeHtml(token.id)}" style="display: flex; flex-direction: column; gap: 0.625rem; overflow-y: auto; flex: 1; padding: 0.25rem 0;" novalidate>
          <div class="form-group">
            <label class="form-label text-xs font-semibold" for="replace-connection-name">Connection name *</label>
            <input type="text" id="replace-connection-name" name="label" class="form-input text-sm" value="${escapeHtml(token.label)}" required aria-required="true" maxlength="80" autocomplete="off" aria-describedby="replace-connection-name-error" />
            <p class="field-error" id="replace-connection-name-error" data-field-error="label" hidden></p>
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-semibold" for="replace-connection-password">Current password *</label>
            <input type="password" id="replace-connection-password" name="password" class="form-input text-sm" placeholder="Re-enter password to authorize" required aria-required="true" autocomplete="current-password" aria-describedby="replace-connection-password-error" />
            <p class="field-error" id="replace-connection-password-error" data-field-error="password" hidden></p>
          </div>

          <details class="border border-subtle rounded-md p-2" open>
            <summary class="text-xs font-semibold cursor-pointer text-primary">Allowed scope permissions (narrowing only)</summary>
            <p class="text-xs text-muted mt-1 mb-2">Replacement tokens cannot widen scope grants. You may keep or narrow existing scopes.</p>
            <p class="field-error" id="replace-scopes-error" data-field-error="scopes" role="alert" hidden></p>
            <div class="grid grid-cols-1 gap-1.5 text-xs" id="replace-scopes-checklist">
              ${allowedScopes.map((scope) => `
                <label class="flex items-center gap-2">
                  <input type="checkbox" name="scopes" value="${escapeHtml(scope)}" checked />
                  <span><code>${escapeHtml(scope)}</code></span>
                </label>
              `).join('')}
            </div>
          </details>

          <div class="form-group">
            <span class="form-label text-xs font-semibold" id="course-access-label">Course access</span>
            <p class="field-error" data-field-error="courses" role="alert" hidden></p>
            ${isAllCourses ? `
              <div class="space-y-1 mt-0.5">
                <label class="flex items-center gap-2 text-xs">
                  <input type="radio" name="courseScopeType" value="all" checked />
                  <span>All owned courses (including future courses)</span>
                </label>
                <label class="flex items-center gap-2 text-xs">
                  <input type="radio" name="courseScopeType" value="selected" />
                  <span>Selected courses</span>
                </label>
              </div>
              ${selectableCourses.length > 0 ? `
                <div id="replace-selected-courses-container" class="mt-1 pl-4 border-l border-subtle hidden space-y-1 max-h-24 overflow-y-auto">
                  ${selectableCourses.map((c) => `
                    <label class="flex items-center gap-2 text-xs">
                      <input type="checkbox" name="selectedCourses" value="${escapeHtml(c.id)}" />
                      <span>${escapeHtml(c.title)}</span>
                    </label>
                  `).join('')}
                </div>
              ` : ''}
            ` : `
              <p class="text-xs text-secondary mt-0.5">Course access cannot be expanded to all owned courses. You may select among currently authorized courses:</p>
              <input type="hidden" name="courseScopeType" value="selected" />
              <div id="replace-selected-courses-container" class="mt-1 pl-4 border-l border-subtle space-y-1 max-h-24 overflow-y-auto">
                ${selectableCourses.length > 0 ? selectableCourses.map((c) => `
                  <label class="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="selectedCourses" value="${escapeHtml(c.id)}" checked />
                    <span>${escapeHtml(c.title)}</span>
                  </label>
                `).join('') : `
                  <p class="text-xs text-muted">No specific courses assigned to this token.</p>
                `}
              </div>
            `}
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-semibold" for="replace-expiry-days">Expiry duration</label>
            <select id="replace-expiry-days" name="expiryDays" class="form-input text-sm">
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30" selected>30 days (Default)</option>
              <option value="90">90 days</option>
            </select>
          </div>

          <footer class="dialog-footer flex justify-end gap-3 pt-3 border-t border-subtle mt-1" style="position: sticky; bottom: 0; background: var(--bg-raised, #1c2128);">
            <button type="button" class="btn btn-secondary btn-compact" data-dialog-action="cancel">Cancel</button>
            <button type="submit" class="btn btn-primary btn-compact" id="btn-submit-replace-token">Replace token</button>
          </footer>
        </form>
      </div>
    </div>
  `;
}

export function renderCreateTokenModal(courses: AuthorCourseOption[], error?: string): string {
  return `
    <div id="create-token-modal" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="create-token-title" style="overflow-y: auto;">
      <div class="modal-dialog" tabindex="-1" style="max-width: 520px; max-height: calc(100vh - 2rem); margin: auto; padding: var(--space-4); display: flex; flex-direction: column;">
        <header class="dialog-header mb-1">
          <h2 id="create-token-title" class="dialog-title text-base font-semibold">Create access token</h2>
          <p class="text-xs text-secondary">Issue a scoped credential for external AI agents using MCP.</p>
        </header>

        ${error ? `<div id="create-token-error" class="form-error p-2 text-xs border border-danger rounded" role="alert">${escapeHtml(error)}</div>` : ''}

        <form id="create-token-form" style="display: flex; flex-direction: column; gap: 0.625rem; overflow-y: auto; flex: 1; padding: 0.25rem 0;" novalidate>
          <div class="form-group">
            <label class="form-label text-xs font-semibold" for="connection-name">Connection name *</label>
            <input type="text" id="connection-name" name="label" class="form-input text-sm" placeholder="e.g. My course-writing agent" required aria-required="true" maxlength="80" autocomplete="off" aria-describedby="connection-name-error" />
            <p class="field-error" id="connection-name-error" data-field-error="label" hidden></p>
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-semibold" for="connection-password">Current password *</label>
            <input type="password" id="connection-password" name="password" class="form-input text-sm" placeholder="Re-enter password to authorize" required aria-required="true" autocomplete="current-password" aria-describedby="connection-password-error" />
            <p class="field-error" id="connection-password-error" data-field-error="password" hidden></p>
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-semibold" for="permission-preset">Permission preset</label>
            <select id="permission-preset" name="preset" class="form-input text-sm">
              <option value="draft_authoring" selected>Draft authoring (Recommended)</option>
              <option value="read_only">Read only</option>
              <option value="full_course_control">Full course control</option>
              <option value="custom">Custom</option>
            </select>
            <p class="form-hint text-xs text-muted" id="permission-preset-hint" style="margin-top: 0.125rem;">
              Draft edits, media uploads, and exercise validation. Publishing & deletion off by default.
            </p>
          </div>

          <details class="border border-subtle rounded-md p-2">
            <summary class="text-xs font-semibold cursor-pointer text-primary">Detailed scope permissions</summary>
            <p class="field-error" id="scopes-error" data-field-error="scopes" role="alert" hidden></p>
            <div class="grid grid-cols-1 gap-1.5 mt-2 text-xs" id="scopes-checklist">
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="courses:read" checked />
                <span><code>courses:read</code>: Read course metadata and drafts</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="courses:create" checked />
                <span><code>courses:create</code>: Create new course drafts</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="content:write" checked />
                <span><code>content:write</code>: Create/edit modules, lessons, and steps</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="media:write" checked />
                <span><code>media:write</code>: Upload and attach course images</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="exercises:validate" checked />
                <span><code>exercises:validate</code>: Run Python reference validation</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="content:delete" />
                <span><code>content:delete</code>: Delete draft steps and modules</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="courses:publish" />
                <span><code>courses:publish</code>: Publish validated draft revisions</span>
              </label>
              <label class="flex items-center gap-2">
                <input type="checkbox" name="scopes" value="courses:manage" />
                <span><code>courses:manage</code>: Change access, archive, or restore</span>
              </label>
            </div>
          </details>

          <div class="form-group">
            <span class="form-label text-xs font-semibold" id="course-access-label">Course access</span>
            <p class="field-error" data-field-error="courses" role="alert" hidden></p>
            <div class="space-y-1 mt-0.5">
              <label class="flex items-center gap-2 text-xs">
                <input type="radio" name="courseScopeType" value="all" checked />
                <span>All owned courses (including future courses)</span>
              </label>
              <label class="flex items-center gap-2 text-xs">
                <input type="radio" name="courseScopeType" value="selected" />
                <span>Selected courses</span>
              </label>
            </div>
            ${
              courses.length > 0
                ? `
              <div id="selected-courses-container" class="mt-1 pl-4 border-l border-subtle hidden space-y-1 max-h-24 overflow-y-auto">
                ${courses
                  .map(
                    (c) => `
                  <label class="flex items-center gap-2 text-xs">
                    <input type="checkbox" name="selectedCourses" value="${escapeHtml(c.id)}" />
                    <span>${escapeHtml(c.title)}</span>
                  </label>
                `
                  )
                  .join('')}
              </div>
            `
                : ''
            }
          </div>

          <div class="form-group">
            <label class="form-label text-xs font-semibold" for="expiry-days">Expiry duration</label>
            <select id="expiry-days" name="expiryDays" class="form-input text-sm">
              <option value="1">1 day</option>
              <option value="7">7 days</option>
              <option value="30" selected>30 days (Default)</option>
              <option value="90">90 days</option>
            </select>
          </div>

          <footer class="dialog-footer flex justify-end gap-3 pt-3 border-t border-subtle mt-1" style="position: sticky; bottom: 0; background: var(--bg-raised, #1c2128);">
            <button type="button" class="btn btn-secondary btn-compact" data-dialog-action="cancel">Cancel</button>
            <button type="submit" class="btn btn-primary btn-compact" id="btn-submit-create-token">Create token</button>
          </footer>
        </form>
      </div>
    </div>
  `;
}
