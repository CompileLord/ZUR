import { renderButton, renderStatusBadge } from '../../components/common/index.ts';
import { formatScopeSummary, formatCourseRestrictions, type ConnectionTokenItem } from './AiConnectionsPage.ts';

export type CompatibleClient = 'claude_desktop' | 'cursor' | 'goose' | 'generic' | 'oauth_client';

export interface McpClientSetupOptions {
  token: ConnectionTokenItem;
  endpointUrl?: string;
  selectedClient?: CompatibleClient;
  isDialog?: boolean;
}

export function generateClientSnippet(client: CompatibleClient, endpointUrl: string): string {
  switch (client) {
    case 'claude_desktop':
      return JSON.stringify(
        {
          mcpServers: {
            zur: {
              url: endpointUrl,
              headers: {
                Authorization: 'Bearer YOUR_ZUR_MCP_TOKEN',
              },
            },
          },
        },
        null,
        2
      );

    case 'cursor':
      return JSON.stringify(
        {
          mcpServers: {
            zur: {
              url: endpointUrl,
              headers: {
                Authorization: 'Bearer YOUR_ZUR_MCP_TOKEN',
              },
            },
          },
        },
        null,
        2
      );

    case 'goose':
      return `extensions:\n  zur:\n    type: streamable_http\n    uri: "${endpointUrl}"\n    headers:\n      Authorization: "Bearer YOUR_ZUR_MCP_TOKEN"`;

    case 'generic':
      return `POST ${endpointUrl} HTTP/1.1\nHost: localhost:3000\nContent-Type: application/json\nAuthorization: Bearer YOUR_ZUR_MCP_TOKEN`;

    case 'oauth_client':
      return 'This client requires OAuth. The current connection supports manually configured bearer tokens.';
  }
}

export function renderMcpClientSetupContent(opts: McpClientSetupOptions): string {
  const endpoint = opts.endpointUrl || (typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : 'http://localhost:3000/api/mcp');
  const selectedClient = opts.selectedClient || 'claude_desktop';
  const token = opts.token;

  const isConnected = Boolean(token.lastUsedAt);

  const snippet = generateClientSnippet(selectedClient, endpoint);

  const examplePrompt =
    'Create a private draft course on Python loops with one module, three lessons, Markdown explanations, an uploaded diagram, and exercises with reference solutions. Validate the draft and summarize the changes.';

  return `
    <div class="setup-content space-y-6" id="mcp-setup-container">
      <div class="setup-header flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-subtle">
        <div>
          <div class="flex items-center gap-3">
            <h2 class="text-xl font-semibold text-primary">${token.label}</h2>
            ${
              token.isRevoked
                ? renderStatusBadge({ status: 'danger', label: 'Revoked' })
                : isConnected
                ? renderStatusBadge({ status: 'success', label: 'Connected' })
                : renderStatusBadge({ status: 'info', label: 'Waiting for requests' })
            }
          </div>
          <p class="text-xs font-mono text-muted mt-1">Identifier: ${token.tokenIdentifier} · Scopes: ${formatScopeSummary(token.scopes)}</p>
        </div>
        <div class="text-xs text-secondary">
          Courses: <strong>${formatCourseRestrictions(token.courseRestrictions)}</strong>
        </div>
      </div>

      <div class="setup-rail">
        <!-- Step 1: Choose Client -->
        <section class="setup-step-card" aria-labelledby="step-1-title">
          <div class="setup-step-badge" aria-hidden="true">1</div>
          <div class="setup-step-main">
            <h3 id="step-1-title" class="text-base font-semibold text-primary">Choose a compatible client</h3>
            <p class="text-xs text-secondary">
              Select your AI tool to view tested configuration syntax. Clients must support explicit HTTP bearer credentials.
            </p>

            <div class="setup-client-tabs mt-2" role="tablist" aria-label="Supported AI clients">
              <button type="button" class="btn btn-secondary btn-compact client-tab-btn ${selectedClient === 'claude_desktop' ? 'btn-primary active' : ''}" data-client="claude_desktop" role="tab" aria-selected="${selectedClient === 'claude_desktop'}">
                Claude Desktop
              </button>
              <button type="button" class="btn btn-secondary btn-compact client-tab-btn ${selectedClient === 'cursor' ? 'btn-primary active' : ''}" data-client="cursor" role="tab" aria-selected="${selectedClient === 'cursor'}">
                Cursor
              </button>
              <button type="button" class="btn btn-secondary btn-compact client-tab-btn ${selectedClient === 'goose' ? 'btn-primary active' : ''}" data-client="goose" role="tab" aria-selected="${selectedClient === 'goose'}">
                Goose
              </button>
              <button type="button" class="btn btn-secondary btn-compact client-tab-btn ${selectedClient === 'generic' ? 'btn-primary active' : ''}" data-client="generic" role="tab" aria-selected="${selectedClient === 'generic'}">
                Generic HTTP
              </button>
              <button type="button" class="btn btn-secondary btn-compact client-tab-btn ${selectedClient === 'oauth_client' ? 'btn-primary active' : ''}" data-client="oauth_client" role="tab" aria-selected="${selectedClient === 'oauth_client'}">
                OAuth-only client
              </button>
            </div>

            ${
              selectedClient === 'oauth_client'
                ? `
              <div class="p-3 bg-raised border border-warning rounded text-xs text-warning mt-2" role="alert">
                <strong>OAuth Limitation Notice:</strong> This client requires OAuth. The current connection supports manually configured bearer tokens. OAuth discovery flow will be available in a future update.
              </div>
            `
                : ''
            }
          </div>
        </section>

        <!-- Step 2: Add MCP Endpoint -->
        <section class="setup-step-card" aria-labelledby="step-2-title">
          <div class="setup-step-badge" aria-hidden="true">2</div>
          <div class="setup-step-main">
            <h3 id="step-2-title" class="text-base font-semibold text-primary">Add the MCP endpoint</h3>
            <p class="text-xs text-secondary">
              Connect via the official Model Context Protocol (MCP) Streamable HTTP transport:
            </p>

            <div class="flex items-center gap-2 mt-1">
              <input
                type="text"
                id="endpoint-url-input"
                class="form-input font-mono text-xs flex-1"
                value="${endpoint}"
                readonly
                aria-label="MCP Server Endpoint URL"
              />
              <button type="button" class="btn btn-secondary btn-compact" id="btn-copy-endpoint">
                Copy endpoint
              </button>
            </div>
            <p class="text-xs text-muted">
              Transport: <code>Streamable HTTP</code> · Loopback development mode enabled.
            </p>
          </div>
        </section>

        <!-- Step 3: Set Credential -->
        <section class="setup-step-card" aria-labelledby="step-3-title">
          <div class="setup-step-badge" aria-hidden="true">3</div>
          <div class="setup-step-main">
            <div class="flex items-center justify-between">
              <h3 id="step-3-title" class="text-base font-semibold text-primary">Set the credential securely</h3>
              <button type="button" class="btn btn-secondary btn-compact" id="btn-copy-snippet">
                Copy configuration
              </button>
            </div>
            <p class="text-xs text-secondary">
              Replace <code>YOUR_ZUR_MCP_TOKEN</code> with the secret generated during creation. Never share your secret or paste it into chat prompts.
            </p>

            <pre class="setup-code-block mt-2"><code>${snippet}</code></pre>
          </div>
        </section>

        <!-- Step 4: Verify Access -->
        <section class="setup-step-card" aria-labelledby="step-4-title">
          <div class="setup-step-badge" aria-hidden="true">4</div>
          <div class="setup-step-main">
            <div class="flex items-center justify-between">
              <h3 id="step-4-title" class="text-base font-semibold text-primary">Verify access</h3>
              <button type="button" class="btn btn-secondary btn-compact" id="btn-refresh-status">
                Refresh connection status
              </button>
            </div>
            <p class="text-xs text-secondary">
              In your client, invoke the <code>get_author_context</code> tool to complete the verification handshake.
            </p>

            <div class="verification-status-box mt-2" role="region" aria-live="polite">
              ${
                isConnected
                  ? `
                <div class="space-y-1">
                  <div class="flex items-center gap-2 text-sm font-semibold text-success">
                    <span>✓</span> Connected & Verified
                  </div>
                  <p class="text-xs text-secondary">
                    Last observed authenticated request: <strong>${new Date(token.lastUsedAt!).toLocaleString()}</strong>
                  </p>
                </div>
              `
                  : `
                <div class="space-y-1">
                  <div class="flex items-center gap-2 text-sm font-semibold text-secondary">
                    <span>⏳</span> Waiting for the first authenticated request
                  </div>
                  <p class="text-xs text-muted">
                    No requests have been received yet for this token. Run a test prompt in your client to connect.
                  </p>
                </div>
              `
              }
            </div>

            <!-- Example prompt box -->
            <div class="border border-subtle rounded-md p-4 bg-canvas mt-3">
              <div class="flex items-center justify-between mb-2">
                <span class="text-xs font-semibold text-primary">Sample verification prompt:</span>
                <button type="button" class="btn btn-secondary btn-compact text-xs" id="btn-copy-prompt" data-prompt="${examplePrompt}">
                  Copy prompt
                </button>
              </div>
              <p class="text-xs text-secondary italic">
                "${examplePrompt}"
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  `;
}

export function renderMcpClientSetupPage(opts: McpClientSetupOptions): string {
  return `
    <div class="settings-connections-container py-6">
      <div class="mb-4">
        <a href="/settings/ai-connections" class="btn btn-secondary btn-compact inline-flex items-center gap-1 text-xs">
          ← Back to AI connections
        </a>
      </div>

      ${renderMcpClientSetupContent(opts)}
    </div>
  `;
}

export function renderMcpClientSetupDialog(opts: McpClientSetupOptions): string {
  return `
    <div id="mcp-setup-dialog" class="modal-backdrop" role="dialog" aria-modal="true" aria-labelledby="setup-dialog-title">
      <div class="modal-dialog" tabindex="-1" style="max-width: 760px;">
        <header class="dialog-header flex justify-between items-center">
          <h2 id="setup-dialog-title" class="dialog-title">Connection setup and verification</h2>
          <button type="button" class="btn-icon btn-compact" data-dialog-action="cancel" aria-label="Close setup dialog">✕</button>
        </header>

        <div class="dialog-body py-4">
          ${renderMcpClientSetupContent({ ...opts, isDialog: true })}
        </div>

        <footer class="dialog-footer flex justify-end pt-4 border-t border-subtle">
          <button type="button" class="btn btn-primary" data-dialog-action="cancel">Done</button>
        </footer>
      </div>
    </div>
  `;
}
