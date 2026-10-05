import { escapeHtml } from '../../utils/escape-html.ts';
import { renderSettingsNav } from './SettingsNav.ts';
import { renderButton } from '../../components/common/index.ts';
import type { PrivacyRequest } from 'zur-shared';

export interface PrivacySettingsPageOptions {
  requests?: PrivacyRequest[];
  ownedCourseCount?: number;
  error?: string;
  successMessage?: string;
  exportData?: any;
  exportDownloadUrl?: string;
  isLoading?: boolean;
}

const escapePrivacy = (value: unknown): string => String(value ?? '').replace(/[&<>"']/g, (c) => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[c]!));

export function renderPrivacySettingsPage(opts: PrivacySettingsPageOptions = {}): string {
  const requests = opts.requests || [];
  const ownedCount = opts.ownedCourseCount || 0;
  const isSoleOwner = ownedCount > 0;

  return `
    <div class="settings-container">
      <header class="settings-header">
        <h1 class="settings-title">Settings</h1>
        ${renderSettingsNav('privacy')}
      </header>
      <h2 class="sr-only">Privacy and account requests</h2>

      ${
        opts.error
          ? `
        <div id="privacy-error" class="form-error mb-6 p-3 border border-danger rounded" role="alert" aria-live="polite">
          <span aria-hidden="true">⚠</span> <span>${escapeHtml(opts.error)}</span>
        </div>
      `
          : '<div id="privacy-error" class="sr-only" role="alert" aria-live="polite"></div>'
      }

      ${
        opts.successMessage
          ? `
        <div id="privacy-success" class="mb-6 p-3 bg-surface border border-accent rounded text-sm text-success flex items-center gap-2" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span> <span>${opts.successMessage}</span>
        </div>
      `
          : ''
      }

      <div>
        <!-- Privacy Overview -->
        <section class="settings-section" aria-labelledby="privacy-overview-heading">
          <div class="settings-section-header">
            <h3 id="privacy-overview-heading" class="settings-section-title">Data retention</h3>
            <p class="settings-section-desc">How ZUR processes records and personal information.</p>
          </div>

          <div class="settings-section-content">
            <p class="text-sm text-secondary leading-relaxed">
              We store only what is required to facilitate learning: display name, email, enrollments, step progress, and submitted code attempts. We do not track activity across external websites or sell personal information.
            </p>
            <div>
              <a href="/privacy" class="text-sm text-primary underline">Read our complete Data Retention and Privacy Policy</a>
            </div>
          </div>
        </section>

        <!-- Data Export Section -->
        <section class="settings-section" aria-labelledby="export-heading">
          <div class="settings-section-header">
            <h3 id="export-heading" class="settings-section-title">Request data export</h3>
            <p class="settings-section-desc">Download a portable copy of your account data and learning history.</p>
          </div>

          <div class="settings-section-content">
            <div class="settings-action-row">
              <div class="settings-row-text">
                <div class="settings-row-title">Learning records export</div>
                <div class="settings-row-desc">JSON archive containing completed exercises, code attempts, and progress.</div>
              </div>
              <form id="export-data-form">
                ${renderButton({
                  id: 'btn-export-data',
                  label: opts.isLoading ? 'Exporting…' : 'Export my data',
                  variant: 'secondary',
                  type: 'submit',
                  disabled: opts.isLoading,
                })}
              </form>
            </div>

            ${
              opts.exportData
                ? `
              <div id="export-download-panel" class="p-4 bg-canvas border border-subtle rounded">
                <span class="text-xs font-semibold uppercase text-muted block mb-2">Export ready</span>
                <p class="text-sm text-secondary mb-3">Your export has been compiled. You can download the JSON payload below.</p>
                <a
                  id="download-export-link"
                  href="${escapePrivacy(opts.exportDownloadUrl||`data:application/json;charset=utf-8,${encodeURIComponent(JSON.stringify(opts.exportData, null, 2))}`)}"
                  ${opts.exportDownloadUrl?'':'download="zur-learning-export.json"'}
                  class="btn btn-secondary btn-compact"
                >
                  ${opts.exportDownloadUrl?'Download ZIP export':'Download zur-learning-export.json'}
                </a>
              </div>
            `
                : ''
            }
          </div>
        </section>

        <!-- Account Deletion Section -->
        <section class="settings-section" aria-labelledby="delete-heading">
          <div class="settings-section-header">
            <h3 id="delete-heading" class="settings-section-title">Request account deletion</h3>
            <p class="settings-section-desc">Permanently close this account and initiate data purge procedures.</p>
          </div>

          <div class="settings-section-content">
            ${
              isSoleOwner
                ? `
              <div class="sole-owner-blocker p-4 bg-canvas border border-warning rounded" role="alert">
                <div class="flex items-center gap-2 mb-1">
                  <span class="text-warning" aria-hidden="true">⚠</span>
                  <span class="text-sm font-semibold">Course ownership transfer required</span>
                </div>
                <p class="text-xs text-secondary leading-relaxed">
                  You are currently the sole owner of <strong>${ownedCount}</strong> course(s). Before your account can be deleted, you must transfer ownership to another author or archive the course so active student learning records remain intact.
                </p>
                <div class="mt-3">
                  <a href="/teach" class="btn btn-secondary btn-compact">Manage your courses</a>
                </div>
              </div>
            `
                : `
              <div class="settings-danger-row destructive">
                <div class="settings-row-text">
                  <div class="settings-row-title text-danger">Permanent closure</div>
                  <div class="settings-row-desc">Revokes active sessions immediately and purges credentials within 30 days under retention policy.</div>
                </div>
                ${renderButton({
                  id: 'btn-open-delete-modal',
                  label: 'Request account deletion',
                  variant: 'destructive',
                  type: 'button',
                })}
              </div>
            `
            }
          </div>
        </section>

        <!-- Past Privacy Requests Log -->
        ${
          requests.length > 0
            ? `
          <section class="settings-section" aria-labelledby="recent-requests-heading">
            <div class="settings-section-header">
              <h3 id="recent-requests-heading" class="settings-section-title">Recent requests</h3>
              <p class="settings-section-desc">Audit history of your recent data export and account requests.</p>
            </div>

            <div class="settings-section-content">
              <div class="space-y-3">
                ${requests
                  .map(
                    (req) => `
                  <div class="flex justify-between items-center py-2 border-b border-subtle text-sm">
                    <div>
                      <span class="font-semibold capitalize">${req.requestType} request</span>
                      <span class="text-xs text-muted block">${new Date(req.createdAt).toLocaleDateString()}</span>
                      ${req.blockerReason ? `<span class="text-xs text-danger block mt-1">${escapePrivacy(req.blockerReason)}</span>` : ''}
                    </div>
                    <div>
                      <span class="status-badge ${req.status === 'completed' ? 'success' : req.status === 'failed' ? 'danger' : 'info'}">
                        ${req.status}
                      </span>
                      ${req.requestType==='export'&&req.exportExpiresAt&&new Date(req.exportExpiresAt).getTime()>Date.now()?`<a class="text-primary underline block mt-2" href="/api/settings/privacy/exports/${encodeURIComponent(req.id)}">Download export · expires ${escapePrivacy(new Date(req.exportExpiresAt).toLocaleString())}</a>`:''}
                    </div>
                  </div>
                `
                  )
                  .join('')}
              </div>
            </div>
          </section>
        `
            : ''
        }
      </div>

      <!-- Account Deletion Consequence Dialog -->
      <div id="delete-account-modal" class="modal-backdrop hidden" role="dialog" aria-modal="true" aria-labelledby="modal-delete-title">
        <div class="modal-dialog" tabindex="-1">
          <header class="dialog-header">
            <h2 id="modal-delete-title" class="dialog-title text-danger">Permanently delete your account?</h2>
            <p class="text-secondary text-sm">
              Please read these consequences carefully before proceeding:
            </p>
          </header>

          <div class="dialog-body my-4 space-y-3 text-sm text-secondary">
            <ul class="list-disc pl-5 space-y-2 text-xs">
              <li>All active browser sessions and author access tokens will be terminated immediately.</li>
              <li>You will immediately lose access to all enrolled courses and ongoing exercises.</li>
              <li>Your personal email, display name, and credentials will be purged from active systems within 30 days.</li>
              <li>This action cannot be undone once submitted.</li>
            </ul>

            <label class="flex items-start gap-2 mt-4 cursor-pointer">
              <input type="checkbox" id="acknowledge-deletion-consequences" class="form-checkbox mt-1" />
              <span class="text-xs text-primary font-medium">I understand that my account will be permanently closed and access revoked immediately.</span>
            </label>
          </div>

          <footer class="dialog-footer flex justify-end gap-3 mt-6">
            <button type="button" id="btn-cancel-deletion" class="btn btn-secondary">Cancel</button>
            <button type="button" id="btn-confirm-deletion" class="btn btn-destructive" disabled>
              Submit deletion request
            </button>
          </footer>
        </div>
      </div>
    </div>
  `;
}
