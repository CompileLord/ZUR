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
    <div class="settings-container max-w-2xl py-6">
      <h1 class="h1 mb-2">Appearance settings</h1>
      <p class="text-sm text-secondary mb-6">Customize the interface theme and Python workspace editor options.</p>

      ${renderSettingsNav('appearance')}

      ${
        opts.error
          ? `
        <div id="appearance-error" class="form-error mb-6 p-3 border border-danger rounded" role="alert" aria-live="polite">
          <span aria-hidden="true">⚠</span> <span>${opts.error}</span>
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

      <form id="appearance-settings-form" class="space-y-6" novalidate>
        <!-- Theme Selection (P18) -->
        <div class="card p-6 bg-surface border border-subtle rounded-lg">
          <h2 class="text-base font-semibold mb-2">Interface theme</h2>
          <p class="text-sm text-secondary mb-4">Choose between dark, light, or automatic system appearance.</p>

          <div class="theme-schematic-grid grid grid-cols-3 gap-4" role="radiogroup" aria-label="Interface theme">
            <!-- Dark Theme Option -->
            <label class="theme-card border ${currentTheme === 'dark' ? 'border-accent ring-1' : 'border-subtle'} rounded-lg p-4 cursor-pointer hover:border-control transition">
              <div class="flex items-center justify-between mb-3">
                <span class="font-semibold text-sm">Dark</span>
                <input type="radio" name="theme" value="dark" ${currentTheme === 'dark' ? 'checked' : ''} class="theme-radio" />
              </div>
              <div class="schematic-preview p-2 rounded bg-[#161715] border border-[#2b2d29] text-[#eceee9] text-xs">
                <div class="h-2 w-12 bg-[#c5e631] rounded-sm mb-2"></div>
                <div class="h-2 w-full bg-[#20221e] rounded-sm mb-1"></div>
                <div class="h-2 w-3/4 bg-[#20221e] rounded-sm"></div>
              </div>
            </label>

            <!-- Light Theme Option -->
            <label class="theme-card border ${currentTheme === 'light' ? 'border-accent ring-1' : 'border-subtle'} rounded-lg p-4 cursor-pointer hover:border-control transition">
              <div class="flex items-center justify-between mb-3">
                <span class="font-semibold text-sm">Light</span>
                <input type="radio" name="theme" value="light" ${currentTheme === 'light' ? 'checked' : ''} class="theme-radio" />
              </div>
              <div class="schematic-preview p-2 rounded bg-[#f4f5f1] border border-[#d6dad0] text-[#1c1e19] text-xs">
                <div class="h-2 w-12 bg-[#5d7300] rounded-sm mb-2"></div>
                <div class="h-2 w-full bg-[#e6e9e0] rounded-sm mb-1"></div>
                <div class="h-2 w-3/4 bg-[#e6e9e0] rounded-sm"></div>
              </div>
            </label>

            <!-- System Mode Option -->
            <label class="theme-card border ${currentTheme === 'system' ? 'border-accent ring-1' : 'border-subtle'} rounded-lg p-4 cursor-pointer hover:border-control transition">
              <div class="flex items-center justify-between mb-3">
                <span class="font-semibold text-sm">System</span>
                <input type="radio" name="theme" value="system" ${currentTheme === 'system' ? 'checked' : ''} class="theme-radio" />
              </div>
              <div class="schematic-preview p-2 rounded bg-surface border border-subtle text-primary text-xs">
                <span class="text-xs text-muted block mb-1">Resolved:</span>
                <span class="text-xs font-semibold uppercase text-secondary">${resolvedSystem}</span>
              </div>
            </label>
          </div>
        </div>

        <!-- Editor Preferences (P18, P15) -->
        <div class="card p-6 bg-surface border border-subtle rounded-lg">
          <h2 class="text-base font-semibold mb-2">Python workspace editor</h2>
          <p class="text-sm text-secondary mb-4">These preferences apply directly to the interactive code editor in exercises.</p>

          <div class="grid grid-cols-2 gap-6">
            <div class="form-group">
              <label for="editorFontSize" class="form-label mb-1">Font size</label>
              <select id="editorFontSize" name="editorFontSize" class="form-select w-full">
                <option value="12" ${fontSize === 12 ? 'selected' : ''}>12px — Compact</option>
                <option value="14" ${fontSize === 14 ? 'selected' : ''}>14px — Standard</option>
                <option value="16" ${fontSize === 16 ? 'selected' : ''}>16px — Large</option>
                <option value="18" ${fontSize === 18 ? 'selected' : ''}>18px — Extra large</option>
              </select>
              <span class="form-hint mt-1 text-xs text-muted">Fixed-width code font scaling</span>
            </div>

            <div class="form-group">
              <label for="indentationSpaces" class="form-label mb-1">Indentation</label>
              <select id="indentationSpaces" name="indentationSpaces" class="form-select w-full">
                <option value="2" ${indent === 2 ? 'selected' : ''}>2 spaces</option>
                <option value="4" ${indent === 4 ? 'selected' : ''}>4 spaces (PEP 8 standard)</option>
              </select>
              <span class="form-hint mt-1 text-xs text-muted">Python indentation depth</span>
            </div>
          </div>
        </div>

        <div class="flex justify-end gap-3 mt-6">
          ${renderButton({
            id: 'btn-save-appearance',
            label: opts.isLoading ? 'Saving…' : 'Save preferences',
            variant: 'primary',
            type: 'submit',
            disabled: opts.isLoading,
          })}
        </div>
      </form>
    </div>
  `;
}
