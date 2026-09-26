import test from 'node:test';
import assert from 'node:assert/strict';
import {
  renderAiConnectionsPage,
  formatScopeSummary,
  formatCourseRestrictions,
  type ConnectionTokenItem,
} from '../src/pages/settings/AiConnectionsPage.ts';
import {
  renderMcpClientSetupPage,
  renderMcpClientSetupDialog,
  generateClientSnippet,
} from '../src/pages/settings/McpClientSetupDialog.ts';
import type { User } from 'zur-shared';

test('AI Connections & Client Setup Pages (P43–P44, T055–T056)', async (t) => {
  const authorUser: User = {
    id: 'user-author-1',
    email: 'guido@zur.internal',
    displayName: 'Guido van Rossum',
    emailVerified: true,
    capabilities: ['author', 'student'],
    accountStatus: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const studentUser: User = {
    id: 'user-student-1',
    email: 'ada@zur.internal',
    displayName: 'Ada Lovelace',
    emailVerified: true,
    capabilities: ['student'],
    accountStatus: 'active',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  const sampleTokens: ConnectionTokenItem[] = [
    {
      id: 'tok-1',
      tokenIdentifier: 'zat_claude_active',
      label: 'Claude Desktop Agent',
      scopes: ['courses:read', 'courses:create', 'content:write', 'media:write', 'exercises:validate'],
      courseRestrictions: ['course-python-foundations'],
      expiresAt: new Date(Date.now() + 25 * 24 * 60 * 60 * 1000).toISOString(),
      isRevoked: false,
      lastUsedAt: new Date(Date.now() - 3600 * 1000).toISOString(),
      createdAt: new Date().toISOString(),
      status: 'active',
    },
    {
      id: 'tok-2',
      tokenIdentifier: 'zat_cursor_new',
      label: 'Cursor Writer',
      scopes: ['courses:read', 'content:write'],
      courseRestrictions: null, // all owned
      expiresAt: new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString(),
      isRevoked: false,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
      status: 'never_used',
    },
    {
      id: 'tok-3',
      tokenIdentifier: 'zat_old_expired',
      label: 'Old Expired Connection',
      scopes: ['courses:read'],
      courseRestrictions: null,
      expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      isRevoked: false,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
      status: 'expired',
    },
    {
      id: 'tok-4',
      tokenIdentifier: 'zat_revoked',
      label: 'Revoked Test Agent',
      scopes: ['courses:read'],
      courseRestrictions: null,
      expiresAt: new Date(Date.now() + 5 * 24 * 60 * 60 * 1000).toISOString(),
      isRevoked: true,
      lastUsedAt: null,
      createdAt: new Date().toISOString(),
      status: 'revoked',
    },
  ];

  // ==========================================
  // T055: P43 AI Connections Page
  // ==========================================

  await t.test('P43: Non-author access shows safe access requirement', () => {
    const html = renderAiConnectionsPage({
      user: studentUser,
      tokens: [],
    });

    assert.ok(html.includes('Author Access Required'), 'Must state author capability required');
    assert.ok(html.includes('Return to learning'), 'Must offer link back');
    assert.ok(!html.includes('btn-open-create-token'), 'Must not render creation button');
  });

  await t.test('P43: Empty state when author has no connections', () => {
    const html = renderAiConnectionsPage({
      user: authorUser,
      tokens: [],
    });

    assert.ok(html.includes('No AI connections yet'), 'Must render empty state message');
    assert.ok(html.includes('btn-empty-create-token'), 'Must offer create access token button in empty state');
    assert.ok(html.includes('View setup guide'), 'Must offer link to guide');
  });

  await t.test('P43: Populated state renders connection list, badges, and controls', () => {
    const html = renderAiConnectionsPage({
      user: authorUser,
      tokens: sampleTokens,
      courses: [{ id: 'course-python-foundations', title: 'Python foundations' }],
    });

    assert.ok(html.includes('Claude Desktop Agent'), 'Token 1 label present');
    assert.ok(html.includes('zat_claude_active'), 'Token 1 identifier present');
    assert.ok(html.includes('Draft authoring'), 'Scope summary preset formatted');
    assert.ok(html.includes('Python foundations'), 'Course restriction formatted');
    assert.ok(html.includes('All owned courses, including future courses'), 'All owned formatted');
    assert.ok(html.includes('Active'), 'Active status badge rendered');
    assert.ok(html.includes('Never used'), 'Never used status badge rendered');
    assert.ok(html.includes('Expired'), 'Expired status badge rendered');
    assert.ok(html.includes('Revoked'), 'Revoked status badge rendered');

    // Never reveals raw secret in the table
    assert.ok(!html.includes('zur_at_'), 'Plaintext secret must never appear in token table');

    // Actions
    assert.ok(html.includes('/settings/ai-connections/tok-1/setup'), 'Setup link present');
    assert.ok(html.includes('data-action="replace-token"'), 'Replace action present');
    assert.ok(html.includes('data-action="revoke-token"'), 'Revoke action present');
  });

  await t.test('P43: Scope and course formatting helpers', () => {
    assert.equal(
      formatScopeSummary([
        'courses:read',
        'courses:create',
        'content:write',
        'content:delete',
        'media:write',
        'exercises:validate',
        'courses:publish',
        'courses:manage',
      ]),
      'Full course control'
    );

    assert.equal(
      formatScopeSummary(['courses:read', 'courses:create', 'content:write', 'media:write', 'exercises:validate']),
      'Draft authoring'
    );

    assert.equal(formatScopeSummary(['courses:read']), 'Read only');
    assert.equal(formatScopeSummary(['courses:read', 'courses:publish']), '2 custom scopes');

    assert.equal(formatCourseRestrictions(null), 'All owned courses, including future courses');
    assert.equal(formatCourseRestrictions([]), 'Created courses only');
  });

  await t.test('P43: Token creation modal contains required fields and all 8 scopes', () => {
    const html = renderAiConnectionsPage({
      user: authorUser,
      tokens: sampleTokens,
      showCreateModal: true,
      courses: [{ id: 'course-python-foundations', title: 'Python foundations' }],
    });

    assert.ok(html.includes('id="create-token-modal"'), 'Modal backdrop present');
    assert.ok(html.includes('id="connection-name"'), 'Connection name input present');
    assert.ok(html.includes('id="connection-password"'), 'Password reauthentication input present');
    assert.ok(html.includes('id="permission-preset"'), 'Permission preset select present');

    // All 8 token scopes in checklist
    assert.ok(html.includes('value="courses:read"'), 'courses:read scope present');
    assert.ok(html.includes('value="courses:create"'), 'courses:create scope present');
    assert.ok(html.includes('value="content:write"'), 'content:write scope present');
    assert.ok(html.includes('value="content:delete"'), 'content:delete scope present');
    assert.ok(html.includes('value="media:write"'), 'media:write scope present');
    assert.ok(html.includes('value="exercises:validate"'), 'exercises:validate scope present');
    assert.ok(html.includes('value="courses:publish"'), 'courses:publish scope present');
    assert.ok(html.includes('value="courses:manage"'), 'courses:manage scope present');

    // Course access options
    assert.ok(html.includes('name="courseScopeType"'), 'Course scope radio buttons present');
    assert.ok(html.includes('id="expiry-days"'), 'Expiry selector present');
  });

  await t.test('P43: One-time token reveal modal displays warning, masked secret, and copy button', () => {
    const sampleRaw = 'zur_at_zat_abc123_sec4567890abcdef1234567890';
    const html = renderAiConnectionsPage({
      user: authorUser,
      tokens: sampleTokens,
      revealedToken: {
        id: 'tok-new-1',
        rawToken: sampleRaw,
        label: 'Brand New Agent',
        scopes: ['courses:read', 'content:write'],
        courseRestrictions: null,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
      },
    });

    assert.ok(html.includes('id="token-reveal-modal"'), 'Reveal modal present');
    assert.ok(html.includes("You won't be able to view this token again"), 'Critical warning present');
    assert.ok(html.includes('id="revealed-token-value"'), 'Secret token input present');
    assert.ok(html.includes(sampleRaw), 'Raw token value present in reveal modal');
    assert.ok(html.includes('id="btn-toggle-secret-visibility"'), 'Reveal/Hide button present');
    assert.ok(html.includes('id="btn-copy-token"'), 'Copy token button present');
    assert.ok(html.includes("I've saved it — view setup"), 'View setup navigation button present');
    assert.ok(html.includes('/settings/ai-connections/tok-new-1/setup'), 'Links to setup for the new token');
  });

  await t.test('P43: Reauthentication errors remain visible inside the open token dialog', () => {
    const html = renderAiConnectionsPage({ user: authorUser, tokens: [], showCreateModal: true, error: 'Invalid password.' });
    assert.match(html, /id="create-token-error"[^>]*role="alert"/);
    assert.match(html, /Invalid password\./);
  });

  await t.test('P43: Revoke confirmation modal displays consequence warning and destructive action', () => {
    const html = renderAiConnectionsPage({
      user: authorUser,
      tokens: sampleTokens,
      revokingToken: sampleTokens[0],
    });

    assert.ok(html.includes('id="revoke-token-modal"'), 'Revoke modal present');
    assert.ok(html.includes('Revoke connection'), 'Modal title present');
    assert.ok(
      html.includes('This connection will lose access. Existing course content will remain.'),
      'Consequence statement present'
    );
    assert.ok(html.includes('id="btn-confirm-revoke"'), 'Confirm revoke button present');
  });

  // ==========================================
  // T056: P44 Client Setup & Verification
  // ==========================================

  await t.test('P44: Client configuration snippets generate valid tested structures', () => {
    const testUrl = 'https://zur.example.com/api/mcp';

    // 1. Claude Desktop
    const claudeSnippet = generateClientSnippet('claude_desktop', testUrl);
    const parsedClaude = JSON.parse(claudeSnippet);
    assert.equal(parsedClaude.mcpServers.zur.url, testUrl);
    assert.equal(parsedClaude.mcpServers.zur.headers.Authorization, 'Bearer YOUR_ZUR_MCP_TOKEN');

    // 2. Cursor
    const cursorSnippet = generateClientSnippet('cursor', testUrl);
    const parsedCursor = JSON.parse(cursorSnippet);
    assert.equal(parsedCursor.mcpServers.zur.url, testUrl);
    assert.equal(parsedCursor.mcpServers.zur.headers.Authorization, 'Bearer YOUR_ZUR_MCP_TOKEN');

    // 3. Goose
    const gooseSnippet = generateClientSnippet('goose', testUrl);
    assert.ok(gooseSnippet.includes('streamable_http'));
    assert.ok(gooseSnippet.includes(testUrl));

    // 4. Generic
    const genericSnippet = generateClientSnippet('generic', testUrl);
    assert.ok(genericSnippet.includes('Authorization: Bearer YOUR_ZUR_MCP_TOKEN'));

    // 5. OAuth-only limitation
    const oauthSnippet = generateClientSnippet('oauth_client', testUrl);
    assert.ok(oauthSnippet.includes('This client requires OAuth'));
  });

  await t.test('P44: McpClientSetupPage renders vertical setup sequence and endpoint', () => {
    const html = renderMcpClientSetupPage({
      token: sampleTokens[0],
      endpointUrl: 'http://localhost:3000/api/mcp',
      selectedClient: 'claude_desktop',
    });

    // Back link
    assert.ok(html.includes('← Back to AI connections'), 'Back link present');
    assert.ok(html.includes('/settings/ai-connections'), 'Back destination correct');

    // Header info
    assert.ok(html.includes('Claude Desktop Agent'), 'Token label in header');
    assert.ok(html.includes('zat_claude_active'), 'Identifier in header');

    // Step 1: Choose client
    assert.ok(html.includes('Choose a compatible client'), 'Step 1 present');
    assert.ok(html.includes('Claude Desktop'), 'Client tab present');
    assert.ok(html.includes('Cursor'), 'Cursor tab present');
    assert.ok(html.includes('Goose'), 'Goose tab present');
    assert.ok(html.includes('OAuth-only client'), 'OAuth tab present');

    // Step 2: Endpoint
    assert.ok(html.includes('Add the MCP endpoint'), 'Step 2 present');
    assert.ok(html.includes('http://localhost:3000/api/mcp'), 'Endpoint URL displayed');
    assert.ok(html.includes('Streamable HTTP'), 'Transport specified');
    assert.ok(html.includes('id="btn-copy-endpoint"'), 'Copy endpoint button present');

    // Step 3: Credential
    assert.ok(html.includes('Set the credential securely'), 'Step 3 present');
    assert.ok(html.includes('YOUR_ZUR_MCP_TOKEN'), 'Placeholder token used');
    assert.ok(html.includes('id="btn-copy-snippet"'), 'Copy snippet button present');

    // Step 4: Verification
    assert.ok(html.includes('Verify access'), 'Step 4 present');
    assert.ok(html.includes('get_author_context'), 'Tool call instruction present');
    assert.ok(html.includes('id="btn-refresh-status"'), 'Refresh status button present');

    // Sample prompt
    assert.ok(html.includes('id="btn-copy-prompt"'), 'Copy prompt button present');
  });

  await t.test('P44: Honest connection status reporting (Active vs Waiting)', () => {
    // 1. Token with lastUsedAt (Connected)
    const connectedHtml = renderMcpClientSetupPage({
      token: sampleTokens[0], // lastUsedAt is set
    });
    assert.ok(connectedHtml.includes('Connected & Verified'), 'Must report verified when lastUsedAt is set');
    assert.ok(connectedHtml.includes('Last observed authenticated request'), 'Must display timestamp');

    // 2. Token without lastUsedAt (Never used)
    const waitingHtml = renderMcpClientSetupPage({
      token: sampleTokens[1], // lastUsedAt is null
    });
    assert.ok(
      waitingHtml.includes('Waiting for the first authenticated request'),
      'Must report waiting when lastUsedAt is null'
    );
    assert.ok(!waitingHtml.includes('Connected & Verified'), 'Must not report fake connection success');
  });

  await t.test('P44: OAuth-only client notice rendered when selected', () => {
    const html = renderMcpClientSetupPage({
      token: sampleTokens[0],
      selectedClient: 'oauth_client',
    });

    assert.ok(html.includes('OAuth Limitation Notice'), 'OAuth warning banner rendered');
    assert.ok(html.includes('This client requires OAuth'), 'Limitation explained');
  });

  await t.test('P44: McpClientSetupDialog renders modal semantics', () => {
    const dialogHtml = renderMcpClientSetupDialog({
      token: sampleTokens[0],
    });

    assert.ok(dialogHtml.includes('id="mcp-setup-dialog"'), 'Dialog backdrop present');
    assert.ok(dialogHtml.includes('role="dialog"'), 'Accessible dialog role present');
    assert.ok(dialogHtml.includes('aria-modal="true"'), 'Modal attribute present');
    assert.ok(dialogHtml.includes('Connection setup and verification'), 'Dialog title present');
  });
});
