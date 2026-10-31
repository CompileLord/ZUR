import test from 'node:test';
import assert from 'node:assert/strict';
import type { User } from 'zur-shared';
import { renderProfileSettingsPage } from '../src/pages/settings/ProfileSettingsPage.ts';
import { renderAppearanceSettingsPage } from '../src/pages/settings/AppearanceSettingsPage.ts';
import { renderSecuritySettingsPage } from '../src/pages/settings/SecuritySettingsPage.ts';
import { renderPrivacySettingsPage } from '../src/pages/settings/PrivacySettingsPage.ts';

const user = (capabilities: User['capabilities']): User => ({
  id: 'u1', email: 'guido@zur.internal', displayName: 'Guido', emailVerified: true, capabilities,
} as User);
const prefs: any = { theme: 'dark', editorFontSize: 14, indentationSpaces: 4 };

function pages(u: User): string[] {
  const isAuthor = u.capabilities.includes('author');
  return [
    renderProfileSettingsPage({ user: u }),
    renderAppearanceSettingsPage({ preferences: prefs, isAuthor }),
    renderSecuritySettingsPage({ user: u }),
    renderPrivacySettingsPage({ isAuthor }),
  ];
}

test('an author can reach AI connections from every settings tab', () => {
  for (const html of pages(user(['student', 'author']))) assert.match(html, /href="\/settings\/ai-connections"/);
});

test('a learner is not shown the AI connections tab', () => {
  for (const html of pages(user(['student']))) assert.doesNotMatch(html, /href="\/settings\/ai-connections"/);
});
