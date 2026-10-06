import { escapeHtml } from '../../utils/escape-html.ts';
import { renderSettingsNav } from './SettingsNav.ts';
import { renderButton } from '../../components/common/index.ts';
import type { UserPreferences } from 'zur-shared';

export interface AppearanceSettingsPageOptions {
  preferences: UserPreferences;
  resolvedSystemTheme?: 'dark' | 'light';
  error?: string;
  successMessage?: string;
  isLoading?: boolean;
}

export function renderAppearanceSettingsPage(opts: AppearanceSettingsPageOptions): string {
  const currentTheme = opts.preferences.theme || 'system';
  const resolvedSystem = opts.resolvedSystemTheme || 'dark';
  const fontSize = opts.preferences.editorFontSize || 14;
  const indent = opts.preferences.indentationSpaces || 4;

  return `
    <div class="settings-container">
      <header class="settings-header">
        <h1 class="settings-title">Settings</h1>
        ${renderSettingsNav('appearance')}
      </header>
      <h2 class="sr-only">Appearance settings</h2>

      ${
        opts.error
          ? `
        <div id="appearance-error" class="form-error mb-6 p-3 border border-danger rounded" role="alert" aria-live="polite">
          <span aria-hidden="true">⚠</span> <span>${escapeHtml(opts.error)}</span>
        </div>
      `
          : '<div id="appearance-error" class="sr-only" role="alert" aria-live="polite"></div>'
      }

      ${
        opts.successMessage
          ? `
        <div id="appearance-success" class="mb-6 p-3 bg-surface border border-accent rounded text-sm text-success flex items-center gap-2" role="status" aria-live="polite">
          <span aria-hidden="true">✓</span> <span>${opts.successMessage}</span>
        </div>
      `
          : ''
      }

      <form id="appearance-settings-form" novalidate>
        <!-- Theme Selection (P18) -->
        <section class="settings-section" aria-labelledby="appearance-theme-heading">
          <div class="settings-section-header">
            <h3 id="appearance-theme-heading" class="settings-section-title">Interface theme</h3>
            <p class="settings-section-desc">Choose between dark, light, or automatic system appearance.</p>
          </div>

          <div class="settings-section-content">
            <div class="theme-options-grid" role="radiogroup" aria-labelledby="appearance-theme-heading">
              <!-- Dark Theme Option -->
              <label class="theme-card ${currentTheme === 'dark' ? 'active' : ''}">
                <div class="theme-card-header">
                  <span class="theme-card-title">Dark</span>
                  <input type="radio" name="theme" value="dark" ${currentTheme === 'dark' ? 'checked' : ''} class="theme-radio" />
                </div>
                <div class="mini-schematic dark" aria-hidden="true">
                  <div class="mini-schematic-sidebar">
                    <div class="mini-schematic-sidebar-item active"></div>
                    <div class="mini-schematic-sidebar-item"></div>
                    <div class="mini-schematic-sidebar-item"></div>
                  </div>
                  <div class="mini-schematic-main">
                    <div class="mini-schematic-title"></div>
                    <div class="mini-schematic-line"></div>
                    <div class="mini-schematic-line" style="width: 55%;"></div>
                    <div class="mini-schematic-btn"></div>
                  </div>
                </div>
              </label>

              <!-- Light Theme Option -->
              <label class="theme-card ${currentTheme === 'light' ? 'active' : ''}">
                <div class="theme-card-header">
                  <span class="theme-card-title">Light</span>
                  <input type="radio" name="theme" value="light" ${currentTheme === 'light' ? 'checked' : ''} class="theme-radio" />
                </div>
                <div class="mini-schematic light" aria-hidden="true">
                  <div class="mini-schematic-sidebar">
                    <div class="mini-schematic-sidebar-item active"></div>
                    <div class="mini-schematic-sidebar-item"></div>
                    <div class="mini-schematic-sidebar-item"></div>
                  </div>
                  <div class="mini-schematic-main">
                    <div class="mini-schematic-title"></div>
                    <div class="mini-schematic-line"></div>
                    <div class="mini-schematic-line" style="width: 55%;"></div>
                    <div class="mini-schematic-btn"></div>
                  </div>
                </div>
              </label>

              <!-- System Mode Option -->
              <label class="theme-card ${currentTheme === 'system' ? 'active' : ''}">
                <div class="theme-card-header">
                  <span class="theme-card-title">System</span>
                  <input type="radio" name="theme" value="system" ${currentTheme === 'system' ? 'checked' : ''} class="theme-radio" />
                </div>
                <div class="mini-schematic system" aria-hidden="true">
                  <div class="mini-schematic-sidebar">
                    <div class="mini-schematic-sidebar-item active"></div>
                    <div class="mini-schematic-sidebar-item"></div>
                    <div class="mini-schematic-sidebar-item"></div>
                  </div>
                  <div class="mini-schematic-main">
                    <div class="mini-schematic-title"></div>
                    <div class="mini-schematic-line"></div>
                    <div class="mini-schematic-line" style="width: 55%;"></div>
                    <div class="mini-schematic-btn"></div>
                  </div>
                </div>
                <span class="text-xs text-muted block mt-2">Follows system (Resolved: ${resolvedSystem})</span>
              </label>
            </div>
          </div>
        </section>

        <!-- Editor Preferences (P18, P15) -->
        <section class="settings-section" aria-labelledby="appearance-editor-heading">
          <div class="settings-section-header">
            <h3 id="appearance-editor-heading" class="settings-section-title">Python workspace editor</h3>
            <p class="settings-section-desc">These preferences apply directly to the interactive code editor in exercises.</p>
          </div>

          <div class="settings-section-content">
            <div class="form-group">
              <label for="editorFontSize" class="form-label mb-1">Font size</label>
              <select id="editorFontSize" name="editorFontSize" class="form-select w-full">
                <option value="12" ${fontSize === 12 ? 'selected' : ''}>12px — Compact</option>
                <option value="14" ${fontSize === 14 ? 'selected' : ''}>14px — Standard</option>
                <option value="16" ${fontSize === 16 ? 'selected' : ''}>16px — Large</option>
                <option value="18" ${fontSize === 18 ? 'selected' : ''}>18px — Extra large</option>
              </select>
            </div>

            <div class="form-group">
              <label for="indentationSpaces" class="form-label mb-1">Indentation</label>
              <select id="indentationSpaces" name="indentationSpaces" class="form-select w-full">
                <option value="2" ${indent === 2 ? 'selected' : ''}>2 spaces</option>
                <option value="4" ${indent === 4 ? 'selected' : ''}>4 spaces (PEP 8 standard)</option>
              </select>
            </div>

            <div id="appearance-autosave-status" class="flex items-center gap-2 text-xs text-muted pt-2" role="status" aria-live="polite">
              <span class="status-indicator"></span>
              <span class="status-text">All preferences saved automatically</span>
            </div>

            <!-- Accessible fallback for tests and script submission -->
            <div class="sr-only">
              ${renderButton({
                id: 'btn-save-appearance',
                label: opts.isLoading ? 'Saving…' : 'Save preferences',
                variant: 'primary',
                type: 'submit',
                disabled: opts.isLoading,
              })}
            </div>
          </div>
        </section>
      </form>
    </div>
  `;
}
