import { escapeHtml } from '../../utils/escape-html.ts';
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
    <div class="settings-container">
      <header class="settings-header">
        <h1 class="settings-title">Settings</h1>
        ${renderSettingsNav('security')}
      </header>
      <h2 class="sr-only">Security settings</h2>

      ${
        opts.error
          ? `
        <div id="security-error" class="form-error mb-6 p-3 border border-danger rounded" role="alert" aria-live="polite">
          <span aria-hidden="true">⚠</span> <span>${escapeHtml(opts.error)}</span>
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

      <div>
        <!-- Section 1: Change Password -->
        <section class="settings-section" aria-labelledby="section-password-title">
          <div class="settings-section-header">
            <h3 id="section-password-title" class="settings-section-title">Change password</h3>
            <p class="settings-section-desc">Requires reauthentication with your current password. Updating your password will sign out other devices.</p>
          </div>

          <div class="settings-section-content">
            <form id="change-password-form" class="space-y-4" novalidate>
              <div class="form-group">
                ${renderTextInput({
                  id: 'currentPassword',
                  name: 'currentPassword',
                  label: 'Current password',
                  type: 'password',
                  required: true,
                })}
              </div>

              <div class="form-group">
                ${renderTextInput({
                  id: 'newPassword',
                  name: 'newPassword',
                  label: 'New password',
                  type: 'password',
                  required: true,
                  hint: 'At least 8 characters with a mix of letters and numbers',
                })}
              </div>

              <div class="form-group">
                ${renderTextInput({
                  id: 'confirmNewPassword',
                  name: 'confirmNewPassword',
                  label: 'Confirm new password',
                  type: 'password',
                  required: true,
                })}
              </div>

              <div class="pt-2">
                ${renderButton({
                  id: 'btn-change-password',
                  label: 'Update password',
                  variant: 'primary',
                  type: 'submit',
                  disabled: opts.isLoading,
                })}
              </div>
            </form>
          </div>
        </section>

        <!-- Section 2: Stronger Admin Authentication (if applicable) -->
        ${
          isAdmin
            ? `
          <section class="settings-section" aria-labelledby="section-admin-auth">
            <div class="settings-section-header">
              <h3 id="section-admin-auth" class="settings-section-title">Elevated authentication</h3>
              <p class="settings-section-desc">Platform administrators must maintain elevated authentication for destructive mutations.</p>
            </div>
            <div class="settings-section-content">
              <div class="settings-action-row">
                <div class="settings-row-text">
                  <div class="settings-row-title">Administrative session status</div>
                  <div class="settings-row-desc">Elevated reauthentication is active and verified.</div>
                </div>
                <span class="status-badge success">Enforced</span>
              </div>
            </div>
          </section>
        `
            : ''
        }

        <!-- Section 3: Active Sessions and Revocation -->
        <section class="settings-section" aria-labelledby="section-sessions-title">
          <div class="settings-section-header">
            <h3 id="section-sessions-title" class="settings-section-title">Session management</h3>
            <p class="settings-section-desc">Manage devices where your account is currently signed in.</p>
          </div>

          <div class="settings-section-content">
            <div class="settings-danger-row">
              <div class="settings-row-text">
                <div class="settings-row-title">All active sessions</div>
                <div class="settings-row-desc">Terminates browser sessions on all devices including this one.</div>
              </div>
              ${renderButton({
                id: 'btn-sign-out-all',
                label: 'Sign out of all devices',
                variant: 'destructive',
                type: 'button',
              })}
            </div>
          </div>
        </section>
      </div>

      <!-- Confirmation Dialog for Sign Out All Devices -->
      <div id="sign-out-all-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="modal-signout-title">
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
