import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderAiConnectionsPage,
  escapeHtml,
  type ConnectionTokenItem,
} from '../src/pages/settings/AiConnectionsPage.ts';
import {
  renderMcpClientSetupPage,
  generateClientSnippet,
} from '../src/pages/settings/McpClientSetupDialog.ts';
import {
  validateTokenForm,
  presetForScopes,
  PRESET_SCOPES,
  type TokenFormValues,
} from '../src/pages/settings/ai-connections-enhancer.ts';
import type { User } from 'zur-shared';

const author = {
  id: 'u1', email: 'g@zur.internal', displayName: 'G', emailVerified: true,
  capabilities: ['author', 'student'], accountStatus: 'active', createdAt: '', updatedAt: '',
} as unknown as User;

const evil = `<img src=x onerror=alert(1)> "q" & 'a'`;
const token = (over: Partial<ConnectionTokenItem> = {}): ConnectionTokenItem => ({
  id: 'tok-1', tokenIdentifier: 'zat_abc', label: evil, scopes: ['courses:read'], courseRestrictions: null,
  expiresAt: '2030-01-01T00:00:00Z', isRevoked: false, lastUsedAt: null, createdAt: '2026-01-01T00:00:00Z', status: 'never_used',
  ...over,
});

test('W6-U: labels, course titles and tokens are HTML-escaped everywhere', () => {
  const html = renderAiConnectionsPage({
    user: author,
    tokens: [token()],
    courses: [{ id: 'c1', title: evil }],
    showCreateModal: true,
    revealedToken: { id: 'tok-1', rawToken: evil, label: evil, scopes: ['courses:read'], courseRestrictions: ['c1'], expiresAt: '2030-01-01T00:00:00Z' },
    revokingToken: token(),
    error: evil,
    successMessage: evil,
  });
  assert.ok(!html.includes('<img src=x'), 'no raw injected markup');
  assert.ok(html.includes(escapeHtml(evil)));
  const setup = renderMcpClientSetupPage({ token: token(), endpointUrl: 'http://x.test/mcp' });
  assert.ok(!setup.includes('<img src=x'));
});

test('W6-U: dialog error is not duplicated in the page banner', () => {
  const html = renderAiConnectionsPage({ user: author, tokens: [token({ label: 'a' })], showCreateModal: true, error: 'Invalid password.' });
  assert.equal(html.split('Invalid password.').length - 1, 1);
  assert.ok(html.includes('id="create-token-error"'));
  const page = renderAiConnectionsPage({ user: author, tokens: [], error: 'Boom' });
  assert.ok(page.includes('Boom'));
});

test('W6-U: filtered-empty state differs from the first-run empty state', () => {
  const filtered = renderAiConnectionsPage({ user: author, tokens: [token({ label: 'a' })], activeFilter: 'expired' });
  assert.ok(filtered.includes('No expired connections'));
  assert.ok(filtered.includes('Show all connections'));
  assert.ok(!filtered.includes('No AI connections yet'));
  const empty = renderAiConnectionsPage({ user: author, tokens: [] });
  assert.ok(empty.includes('No AI connections yet'));
});

test('W6-U: loading state renders a busy status region', () => {
  const html = renderAiConnectionsPage({ user: author, tokens: [], isLoading: true });
  assert.ok(html.includes('aria-busy="true"'));
  assert.ok(!html.includes('No AI connections yet'));
});

test('W6-U: filter links use aria-current rather than a tab role', () => {
  const html = renderAiConnectionsPage({ user: author, tokens: [token({ label: 'a' })], activeFilter: 'active' });
  assert.ok(html.includes('<nav class="filter-tab-bar"'));
  assert.ok(/filter=active"[^>]*aria-current="page"/.test(html));
  assert.ok(!/filter-tab-btn[^>]*role="tab"/.test(html));
});

test('W6-U: create form exposes labelled, described fields with inline error slots', () => {
  const html = renderAiConnectionsPage({ user: author, tokens: [], showCreateModal: true });
  for (const key of ['label', 'password', 'scopes', 'courses']) assert.ok(html.includes(`data-field-error="${key}"`), key);
  assert.ok(html.includes('autocomplete="current-password"'));
  assert.ok(html.includes('aria-describedby="connection-name-error"'));
});

test('W6-U: reveal dialog offers an explicit Close and a setup link', () => {
  const html = renderAiConnectionsPage({
    user: author, tokens: [],
    revealedToken: { id: 'tok 1', rawToken: 'zur_at_x', label: 'L', scopes: ['courses:read'], courseRestrictions: null, expiresAt: '2030-01-01T00:00:00Z' },
  });
  assert.ok(html.includes('id="btn-close-reveal"'));
  assert.ok(html.includes('/settings/ai-connections/tok%201/setup'));
});

test('W6-U: setup page marks the selected client tab as primary only and keeps snippets correct', () => {
  const html = renderMcpClientSetupPage({ token: token({ label: 'ok' }), endpointUrl: 'https://zur.example/mcp', selectedClient: 'generic' });
  assert.ok(/btn btn-primary active btn-compact client-tab-btn" data-client="generic"/.test(html));
  assert.ok(/btn btn-secondary btn-compact client-tab-btn" data-client="official_sdk"/.test(html));
  assert.ok(html.includes('value="https://zur.example/mcp"'));
  assert.ok(html.includes('Authorization: Bearer YOUR_ZUR_MCP_TOKEN'));
  assert.ok(html.includes('Host: zur.example'));
  assert.ok(html.includes('aria-label="Client configuration snippet"'));
  const sdk = generateClientSnippet('official_sdk', 'https://zur.example/mcp');
  assert.ok(sdk.includes("new URL('https://zur.example/mcp')") && sdk.includes('YOUR_ZUR_MCP_TOKEN'));
  const summary = renderMcpClientSetupPage({ token: token({ courseRestrictions: [] }), endpointUrl: 'https://z/mcp' });
  assert.ok(summary.includes('only in courses it creates'));
});

const base: TokenFormValues = {
  label: 'Agent', password: 'pw', scopes: PRESET_SCOPES.draft_authoring, courseScopeType: 'all', selectedCourses: [], availableCourses: 2,
};

test('W6-U: validateTokenForm mirrors the server rules', () => {
  assert.deepEqual(validateTokenForm(base), {});
  assert.ok(validateTokenForm({ ...base, label: '   ' }).label);
  assert.ok(validateTokenForm({ ...base, label: 'x'.repeat(81) }).label);
  assert.ok(validateTokenForm({ ...base, password: '' }).password);
  assert.ok(validateTokenForm({ ...base, scopes: [] }).scopes);
  // selected + none + no courses:create is rejected; allowed with courses:create
  assert.ok(validateTokenForm({ ...base, scopes: ['courses:read'], courseScopeType: 'selected' }).courses);
  assert.deepEqual(validateTokenForm({ ...base, courseScopeType: 'selected' }), {});
  assert.deepEqual(validateTokenForm({ ...base, scopes: ['courses:read'], courseScopeType: 'selected', selectedCourses: ['c1'] }), {});
  assert.match(validateTokenForm({ ...base, scopes: ['courses:read'], courseScopeType: 'selected', availableCourses: 0 }).courses!, /no courses/);
});

test('W6-U: presetForScopes maps exact scope sets back to presets', () => {
  assert.equal(presetForScopes(PRESET_SCOPES.read_only), 'read_only');
  assert.equal(presetForScopes([...PRESET_SCOPES.full_course_control].reverse()), 'full_course_control');
  assert.equal(presetForScopes(['courses:read', 'content:write']), 'custom');
});
