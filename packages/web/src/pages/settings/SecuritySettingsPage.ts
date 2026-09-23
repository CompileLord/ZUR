import { renderSettingsNav } from './SettingsNav.ts';
import { renderTextInput, renderButton } from '../../components/common/index.ts';
import type { User } from 'zur-shared';

export interface SecuritySettingsPageOptions {
  user: User;
  error?: string;
  successMessage?: string;
  isLoading?: boolean;
}

export function renderSecuritySettingsPage(opts: SecuritySettingsPageOptions): string {
  const isAdmin = opts.user.capabilities.includes('admin');

  return `
    <div class="settings-container max-w-2xl py-6">
      <h1 class="h1 mb-2">Security settings</h1>
      <p class="text-sm text-secondary mb-6">Manage your credentials, active sessions, and authentication security.</p>

      ${renderSettingsNav('security')}

      ${
        opts.error
          ? `
        <div id="security-error" class="form-error mb-6 p-3 border border-danger rounded" role="alert" aria-live="polite">
          <span aria-hidden="true">⚠</span> <span>${opts.error}</span>
        </div>
      `
          : '<div id="security-error" class="sr-only" role="alert" aria-live="polite"></div>'
      }

      ${
        opts.successMessage
          ? `
        <div id="security-success" class="mb-6 p-3 bg-surface border border-accent rounded text-sm text-success flex items-center gap-2" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span> <span>${opts.successMessage}</span>
        </div>
      `
          : ''
      }

      <div class="space-y-8">
        <!-- Section 1: Change Password -->
        <section class="card p-6 bg-surface border border-subtle rounded-lg" aria-labelledby="section-password-title">
          <h2 id="section-password-title" class="text-base font-semibold mb-2">Change password</h2>
          <p class="text-sm text-secondary mb-4">Requires reauthentication with your current password. Updating your password will sign out other devices.</p>

          <form id="change-password-form" class="space-y-4" novalidate>
            ${renderTextInput({
              id: 'currentPassword',
              name: 'currentPassword',
              label: 'Current password',
              type: 'password',
              required: true,
            })}

            ${renderTextInput({
              id: 'newPassword',
              name: 'newPassword',
              label: 'New password',
              type: 'password',
              required: true,
              hint: 'At least 8 characters with a mix of letters and numbers',
            })}

            ${renderTextInput({
              id: 'confirmNewPassword',
              name: 'confirmNewPassword',
              label: 'Confirm new password',
              type: 'password',
              required: true,
            })}

            <div class="flex justify-end pt-2">
              ${renderButton({
                id: 'btn-change-password',
                label: 'Update password',
                variant: 'primary',
                type: 'submit',
                disabled: opts.isLoading,
              })}
            </div>
          </form>
        </section>

        <!-- Section 2: Stronger Admin Authentication (if applicable) -->
        ${
          isAdmin
            ? `
          <section class="card p-6 bg-surface border border-subtle rounded-lg" aria-labelledby="section-admin-auth">
            <div class="flex items-center justify-between mb-2">
              <h2 id="section-admin-auth" class="text-base font-semibold">Elevated administrative authentication</h2>
              <span class="status-badge success">Enforced</span>
            </div>
            <p class="text-sm text-secondary mb-4">
              As a platform administrator, sensitive operations require short-lived elevated reauthentication within 15 minutes of execution.
            </p>
            <div class="p-3 bg-canvas border border-subtle rounded text-xs text-secondary">
              Current administrative session status: <strong>Active & Verified</strong>
            </div>
          </section>
        `
            : ''
        }

        <!-- Section 3: Active Sessions and Revocation -->
        <section class="card p-6 bg-surface border border-subtle rounded-lg" aria-labelledby="section-sessions-title">
          <h2 id="section-sessions-title" class="text-base font-semibold mb-2">Session management</h2>
          <p class="text-sm text-secondary mb-4">
            If you suspect unauthorized access or lost a device, you can sign out of all active browser sessions immediately.
          </p>

          <div class="flex justify-between items-center pt-2">
            <div>
              <span class="text-sm font-semibold block">All active sessions</span>
              <span class="text-xs text-muted">Terminates sessions on all devices including this one.</span>
            </div>
            ${renderButton({
              id: 'btn-sign-out-all',
              label: 'Sign out of all devices',
              variant: 'destructive',
              type: 'button',
            })}
          </div>
        </section>
      </div>

      <!-- Confirmation Dialog for Sign Out All Devices -->
      <div id="sign-out-all-modal" class="modal-backdrop" style="display: none;" role="dialog" aria-modal="true" aria-labelledby="modal-signout-title">
        <div class="modal-dialog" tabindex="-1">
          <header class="dialog-header">
            <h2 id="modal-signout-title" class="dialog-title">Sign out of all devices?</h2>
            <p class="text-secondary text-sm">
              This will revoke all active browser sessions. You will be redirected to the sign-in page to log in again.
            </p>
          </header>
          <footer class="dialog-footer flex justify-end gap-3 mt-6">
            <button type="button" id="btn-cancel-signout-all" class="btn btn-secondary">Cancel</button>
            <button type="button" id="btn-confirm-signout-all" class="btn btn-destructive">Sign out everywhere</button>
          </footer>
        </div>
      </div>
    </div>
  `;
}
