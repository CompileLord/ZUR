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
    <div class="settings-container max-w-2xl py-6">
      <h1 class="h1 mb-2">Profile settings</h1>
      <p class="text-sm text-secondary mb-6">Manage how you are identified on rosters and course submissions.</p>

      ${renderSettingsNav('profile')}

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

      <form id="profile-settings-form" class="space-y-6" novalidate>
        <div class="card p-6 bg-surface border border-subtle rounded-lg">
          <h2 class="text-base font-semibold mb-4">Identity</h2>

          ${renderTextInput({
            id: 'displayName',
            name: 'displayName',
            label: 'Display name',
            type: 'text',
            value: opts.user.displayName,
            required: true,
            hint: 'Visible to teachers and peers in enrolled courses.',
          })}

          <div class="email-info-group mt-6">
            <label class="form-label mb-1">Email address</label>
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
            <p class="form-hint mt-2 text-xs text-muted">
              Email addresses cannot be changed directly in the pilot. Contact <a href="/help" class="text-primary underline">support</a> for assistance.
            </p>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          ${renderButton({
            id: 'btn-save-profile',
            label: opts.isLoading ? 'Saving…' : 'Save changes',
            variant: 'primary',
            type: 'submit',
            disabled: opts.isLoading,
          })}
        </div>
      </form>
    </div>
  `;
}
