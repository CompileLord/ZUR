import { renderButton, renderStatusBadge } from '../../components/common/index.ts';
import { formatScopeSummary, formatCourseRestrictions, escapeHtml, type ConnectionTokenItem } from './AiConnectionsPage.ts';

export type CompatibleClient = 'official_sdk' | 'generic' | 'oauth_client';

export interface McpClientSetupOptions {
  token: ConnectionTokenItem;
  endpointUrl?: string;
  selectedClient?: CompatibleClient;
  isDialog?: boolean;
}

export function generateClientSnippet(client: CompatibleClient, endpointUrl: string): string {
  let host = '127.0.0.1:3000';
  try {
    host = new URL(endpointUrl).host;
  } catch {}

  switch (client) {
    case 'official_sdk':
      return [
        "import { Client, StreamableHTTPClientTransport } from '@modelcontextprotocol/client';",
        "",
        "const transport = new StreamableHTTPClientTransport(",
        `  new URL('${endpointUrl}'),`,
        "  {",
        "    requestInit: {",
        "      headers: {",
        "        Authorization: 'Bearer YOUR_ZUR_MCP_TOKEN',",
        "      },",
        "    },",
        "  }",
        ");",
        "",
        "const client = new Client(",
        "  { name: 'author-agent', version: '2.1.0' },",
        "  { capabilities: {}, versionNegotiation: { mode: { pin: '2026-07-28' } } }",
        ");",
        "",
        "await client.connect(transport);",
      ].join('\n');

    case 'generic':
      return `POST ${endpointUrl} HTTP/1.1\nHost: ${host}\nAuthorization: Bearer YOUR_ZUR_MCP_TOKEN\nContent-Type: application/json\nAccept: application/json, text/event-stream\n\n{"jsonrpc":"2.0","method":"tools/list","params":{},"id":1}`;

    case 'oauth_client':
      return 'This client requires OAuth. The current connection supports manually configured bearer tokens.';
  }
}

function escapeSummary(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!));
}

function describeAccess(token: ConnectionTokenItem): string {
  switch (formatScopeSummary(token.scopes)) {
    case 'Full course control':
      return 'create, edit and publish courses';
    case 'Draft authoring':
      return 'create and edit draft courses';
    case 'Read only':
      return 'read courses';
    default:
      return 'use the permissions you selected';
  }
}

function describeCourses(token: ConnectionTokenItem): string {
  if (token.courseRestrictions === null) return 'in all your courses, including future ones';
  if (token.courseRestrictions.length === 0) return 'only in courses it creates';
  return token.courseRestrictions.length === 1 ? 'in 1 selected course' : `in ${token.courseRestrictions.length} selected courses`;
}

export function renderMcpClientSetupContent(opts: McpClientSetupOptions): string {
  const endpoint = opts.endpointUrl || (typeof window !== 'undefined' ? `${window.location.origin}/api/mcp` : 'http://localhost:3000/api/mcp');
  const selectedClient = opts.selectedClient || 'official_sdk';
  const token = opts.token;

  const isConnected = Boolean(token.lastUsedAt);
  const isOAuth = selectedClient === 'oauth_client';

  const snippet = generateClientSnippet(selectedClient, endpoint);

  const examplePrompt =
    'Create a private draft course on Python loops with one module, three lessons, Markdown explanations, an uploaded diagram, and exercises with reference solutions. Validate the draft and summarize the changes.';

  return `
    <div class="setup-content space-y-6" id="mcp-setup-container">
      <div class="setup-header flex items-center justify-between flex-wrap gap-4 pb-4 border-b border-subtle">
        <div>
          <div class="flex items-center gap-3">
            <h2 class="text-xl font-semibold text-primary">${escapeHtml(token.label)}</h2>
            ${
              isOAuth
                ? renderStatusBadge({ status: 'warning', label: 'OAuth unsupported' })
                : token.isRevoked
                ? renderStatusBadge({ status: 'danger', label: 'Revoked' })
                : isConnected
                ? renderStatusBadge({ status: 'info', label: 'Authenticated request observed' })
                : renderStatusBadge({ status: 'info', label: 'Waiting for requests' })
            }
          </div>
          <p class="setup-summary">${escapeSummary(token.label)} can ${describeAccess(token)} ${escapeHtml(describeCourses(token))}.</p>
          <details class="setup-details">
            <summary>Details</summary>
            <p class="text-xs font-mono text-muted">Identifier: ${escapeHtml(token.tokenIdentifier)} · Scopes: ${escapeHtml(formatScopeSummary(token.scopes))}</p>
          </details>
        </div>
      </div>

      <div class="setup-rail">
        <!-- Step 1: Choose Client -->
        <section class="setup-step-card" aria-labelledby="step-1-title">
          <div class="setup-step-badge" aria-hidden="true">1</div>
          <div class="setup-step-main">
            <h3 id="step-1-title" class="text-base font-semibold text-primary">Choose a compatible client</h3>
            <p class="text-xs text-secondary">
              Pick the app you want to connect. It must be able to send a secret key with each request.
            </p>

            <div class="setup-client-tabs mt-2" role="tablist" aria-label="Supported AI clients">
              <button type="button" class="btn ${selectedClient === 'official_sdk' ? 'btn-primary active' : 'btn-secondary'} btn-compact client-tab-btn" data-client="official_sdk" role="tab" aria-selected="${selectedClient === 'official_sdk'}">
                Official MCP SDK (v2)
              </button>
              <button type="button" class="btn ${selectedClient === 'generic' ? 'btn-primary active' : 'btn-secondary'} btn-compact client-tab-btn" data-client="generic" role="tab" aria-selected="${selectedClient === 'generic'}">
                Generic HTTP Bearer
              </button>
              <button type="button" class="btn ${selectedClient === 'oauth_client' ? 'btn-primary active' : 'btn-secondary'} btn-compact client-tab-btn" data-client="oauth_client" role="tab" aria-selected="${selectedClient === 'oauth_client'}">
                OAuth-only client
              </button>
            </div>

            ${
              isOAuth
                ? `
              <div class="p-3 bg-raised border border-warning rounded text-xs text-warning mt-3 space-y-1.5" role="alert">
                <div class="font-semibold">OAuth Limitation Notice:</div>
                <p>This client requires OAuth. The current connection supports manually configured bearer tokens.</p>
                <p class="text-muted">Standard OAuth discovery flow (Authorization Code with PKCE) is currently unsupported. Personal access tokens cannot be used with OAuth-only clients, and no automated connection action is available.</p>
              </div>
            `
                : ''
            }
          </div>
        </section>

        ${
          !isOAuth
            ? `
        <!-- Step 2: Add MCP Endpoint -->
        <section class="setup-step-card" aria-labelledby="step-2-title">
          <div class="setup-step-badge" aria-hidden="true">2</div>
          <div class="setup-step-main">
            <h3 id="step-2-title" class="text-base font-semibold text-primary">Add the MCP endpoint</h3>
            <p class="text-xs text-secondary">
              Paste this address into your client as the server URL.
            </p>

            <div class="setup-endpoint-row">
              <input
                type="text"
                id="endpoint-url-input"
                class="form-input font-mono text-xs setup-endpoint-input"
                value="${escapeHtml(endpoint)}"
                readonly
                aria-label="MCP Server Endpoint URL"
              />
              <button type="button" class="btn btn-secondary btn-compact" id="btn-copy-endpoint">
                Copy endpoint
              </button>
            </div>

            <details class="technical-limits-disclosure mt-3 p-3 bg-surface border border-subtle rounded text-xs" id="technical-limits-details">
              <summary class="cursor-pointer font-medium text-primary flex items-center justify-between" id="technical-limits-summary">
                <span>Technical limits</span>
                <span class="text-muted text-xs font-normal">Details ▾</span>
              </summary>
              <div class="technical-limits-content mt-2 pt-2 border-t border-subtle space-y-1 text-secondary">
                <div>• <strong>Transport:</strong> Streamable HTTP, protocol <code>2026-07-28</code></div>
                <div>• <strong>Image uploads:</strong> Max 10 MB per asset (PNG, JPEG, WebP only; SVG and executables rejected)</div>
                <div>• <strong>Inline media:</strong> Inline base64 capped at 1 MiB decoded size (use <code>create_image_upload</code> for binary assets)</div>
                <div>• <strong>Batch mutations:</strong> Maximum 100 operations and 1 MiB text per batch</div>
              </div>
            </details>
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
              Replace <code>YOUR_ZUR_MCP_TOKEN</code> with the secret shown once when you created this connection. Never share it or paste it into chat prompts.
            </p>

            <pre class="setup-code-block mt-2 font-mono text-xs" tabindex="0" role="region" aria-label="Client configuration snippet"><code>${escapeHtml(snippet)}</code></pre>
          </div>
        </section>

        <!-- Step 4: Verify Access -->
        <section class="setup-step-card" aria-labelledby="step-4-title">
          <div class="setup-step-badge" aria-hidden="true">4</div>
          <div class="setup-step-main">
            <div class="flex items-center justify-between">
              <h3 id="step-4-title" class="text-base font-semibold text-primary">Verify access</h3>
              <button type="button" class="btn btn-secondary btn-compact" id="btn-refresh-status">
                Refresh status
              </button>
            </div>
            <p class="text-xs text-secondary">
              In your client, run the <code>get_author_context</code> tool once. This page will show when the first request arrives.
            </p>

            <div class="verification-status-box mt-2" role="region" aria-live="polite">
              ${
                isConnected
                  ? `
                <div class="space-y-1">
                  <div class="flex items-center gap-2 text-sm font-semibold text-success">
                    <span>✓</span> Authenticated request observed
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
                <button type="button" class="btn btn-secondary btn-compact text-xs" id="btn-copy-prompt" data-prompt="${escapeHtml(examplePrompt)}">
                  Copy prompt
                </button>
              </div>
              <p class="text-xs text-secondary italic">
                "${examplePrompt}"
              </p>
            </div>
          </div>
        </section>
        `
            : ''
        }
      </div>
    </div>
  `;
}

export function renderMcpClientSetupPage(opts: McpClientSetupOptions): string {
  return `
    <div class="settings-connections-container setup-view py-6">
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

        <div class="dialog-body py-2">
          ${renderMcpClientSetupContent({ ...opts, isDialog: true })}
        </div>

        <footer class="dialog-footer flex justify-end pt-3 border-t border-subtle">
          <button type="button" class="btn btn-primary" data-dialog-action="cancel">Done</button>
        </footer>
      </div>
    </div>
  `;
}
