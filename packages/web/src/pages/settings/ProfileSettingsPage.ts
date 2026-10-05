import { escapeHtml } from '../../utils/escape-html.ts';
import { renderSettingsNav } from './SettingsNav.ts';
import { renderTextInput, renderButton, renderStatusBadge } from '../../components/common/index.ts';
import type { User } from 'zur-shared';

export interface ProfileSettingsPageOptions {
  user: User;
  error?: string;
  successMessage?: string;
  isLoading?: boolean;
}

export function renderProfileSettingsPage(opts: ProfileSettingsPageOptions): string {
  return `
    <div class="settings-container">
      <header class="settings-header">
        <h1 class="settings-title">Settings</h1>
        ${renderSettingsNav('profile')}
      </header>
      <h2 class="sr-only">Profile settings</h2>

      ${
        opts.error
          ? `
        <div id="profile-error" class="form-error mb-6 p-3 border border-danger rounded" role="alert" aria-live="polite">
          <span aria-hidden="true">⚠</span> <span>${escapeHtml(opts.error)}</span>
        </div>
      `
          : '<div id="profile-error" class="sr-only" role="alert" aria-live="polite"></div>'
      }

      ${
        opts.successMessage
          ? `
        <div id="profile-success" class="mb-6 p-3 bg-surface border border-accent rounded text-sm text-success flex items-center gap-2" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span> <span>${opts.successMessage}</span>
        </div>
      `
          : ''
      }

      <form id="profile-settings-form" novalidate>
        <section class="settings-section" aria-labelledby="profile-identity-heading">
          <div class="settings-section-header">
            <h3 id="profile-identity-heading" class="settings-section-title">Identity</h3>
            <p class="settings-section-desc">Manage how you are identified on rosters, submissions, and course discussions.</p>
          </div>

          <div class="settings-section-content">
            <div class="form-group">
              ${renderTextInput({
                id: 'displayName',
                name: 'displayName',
                label: 'Display name',
                type: 'text',
                value: opts.user.displayName,
                required: true,
                hint: 'Visible to teachers and peers in enrolled courses.',
              })}
            </div>

            <div class="form-group">
              <label for="profile-email" class="form-label mb-1">Email address</label>
              <div class="flex items-center gap-3">
                <input
                  type="email"
                  id="profile-email"
                  class="form-input bg-canvas text-secondary cursor-not-allowed"
                  value="${opts.user.email}"
                  readonly
                  disabled
                />
                ${
                  opts.user.emailVerified
                    ? renderStatusBadge({ status: 'success', label: 'Verified' })
                    : renderStatusBadge({ status: 'warning', label: 'Unverified' })
                }
              </div>
              <p class="form-hint mt-1 text-xs text-muted">
                Email addresses cannot be changed directly in the pilot. Contact <a href="/help" class="text-primary underline">support</a> for assistance.
              </p>
            </div>

            <div class="pt-2">
              ${renderButton({
                id: 'btn-save-profile',
                label: opts.isLoading ? 'Saving…' : 'Save changes',
                variant: 'primary',
                type: 'submit',
                disabled: opts.isLoading ?? true,
              })}
            </div>
          </div>
        </section>
      </form>
    </div>
  `;
}
