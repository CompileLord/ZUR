export type InvitationEmailDeliveryStatus = 'sent' | 'failed' | 'not_configured';

export interface InvitationEmailDeliveryResult {
  status: InvitationEmailDeliveryStatus;
  sentAt: string | null;
  message: string;
}

export interface InvitationEmail {
  recipientEmail: string;
  courseTitle: string;
  inviterName: string;
  invitationUrl: string;
  expiresAt: string;
}

export interface EmailFetchResponse {
  ok: boolean;
  status: number;
}

export type EmailFetch = (url: string, init: RequestInit) => Promise<EmailFetchResponse>;
export type EmailProvider = 'postmark' | 'mock';

export interface LocalEmailMock {
  capture(email: InvitationEmail, message: { from: string; subject: string; text: string; html: string }): void;
}

export class InMemoryEmailMock implements LocalEmailMock {
  readonly messages: Array<{ email: InvitationEmail; message: { from: string; subject: string; text: string; html: string } }> = [];

  capture(email: InvitationEmail, message: { from: string; subject: string; text: string; html: string }): void {
    this.messages.push({ email: structuredClone(email), message: structuredClone(message) });
  }
}

const missingConfigurationMessage = 'Email delivery is not configured. The invitation remains valid; copy its link to send it manually.';

function defaultProvider(): EmailProvider {
  return process.env.NODE_ENV === 'production' || process.env.NODE_ENV === 'staging' ? 'postmark' : 'mock';
}

export class EmailDeliveryService {
  private readonly config: {
    provider: EmailProvider;
    serverToken?: string;
    from?: string;
    appBaseUrl?: string;
    fetcher?: EmailFetch;
    mock?: LocalEmailMock;
    runtime: string;
  };

  constructor(config: {
    provider?: EmailProvider;
    serverToken?: string;
    from?: string;
    appBaseUrl?: string;
    fetcher?: EmailFetch;
    mock?: LocalEmailMock;
    runtime?: string;
  } = {}) {
    this.config = {
      provider: config.provider || (process.env.EMAIL_PROVIDER as EmailProvider | undefined) || defaultProvider(),
      serverToken: config.serverToken ?? process.env.POSTMARK_SERVER_TOKEN,
      from: config.from ?? process.env.EMAIL_FROM,
      appBaseUrl: config.appBaseUrl ?? process.env.APP_BASE_URL,
      fetcher: config.fetcher,
      mock: config.mock || new InMemoryEmailMock(),
      runtime: config.runtime || process.env.NODE_ENV || 'development',
    };
  }

  async sendInvitation(email: InvitationEmail): Promise<InvitationEmailDeliveryResult> {
    const { provider, serverToken, from, appBaseUrl, runtime, mock } = this.config;
    if (!from || !appBaseUrl) return { status: 'not_configured', sentAt: null, message: missingConfigurationMessage };

    let baseUrl: URL;
    try {
      baseUrl = new URL(appBaseUrl);
      if (!['http:', 'https:'].includes(baseUrl.protocol)) throw new Error('Unsupported app URL scheme.');
    } catch {
      return { status: 'not_configured', sentAt: null, message: missingConfigurationMessage };
    }

    if (provider === 'mock') {
      if (runtime === 'production' || runtime === 'staging' || !mock) {
        return { status: 'not_configured', sentAt: null, message: missingConfigurationMessage };
      }
      mock.capture(email, this.buildMessage(email, from, baseUrl));
      return {
        status: 'not_configured',
        sentAt: null,
        message: 'Captured in the local email mock; no email was sent. The invitation remains valid for manual sharing.',
      };
    }

    if (provider !== 'postmark' || !serverToken) {
      return { status: 'not_configured', sentAt: null, message: missingConfigurationMessage };
    }

    const message = this.buildMessage(email, from, baseUrl);
    try {
      const fetcher = this.config.fetcher || fetch;
      const response = await fetcher('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'X-Postmark-Server-Token': serverToken,
          Accept: 'application/json',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          From: message.from,
          To: email.recipientEmail,
          Subject: message.subject,
          TextBody: message.text,
          HtmlBody: message.html,
          MessageStream: 'outbound',
        }),
      });
      if (!response.ok) {
        return {
          status: 'failed', sentAt: null,
          message: `Email could not be delivered (Postmark returned ${response.status}). The invitation remains valid; copy its link to send it manually.`,
        };
      }
      return {
        status: 'sent', sentAt: new Date().toISOString(),
        message: 'Postmark accepted the invitation email for delivery.',
      };
    } catch {
      return {
        status: 'failed', sentAt: null,
        message: 'Email could not be delivered. The invitation remains valid; copy its link to send it manually.',
      };
    }
  }

  async sendAccountLink(input: {
    recipientEmail: string;
    kind: 'verify' | 'reset';
    path: string;
  }): Promise<InvitationEmailDeliveryResult> {
    const { provider, serverToken, runtime, mock } = this.config;
    const from = this.config.from || (runtime === 'development' ? 'noreply@zur.local' : undefined);
    const appBaseUrl = this.config.appBaseUrl || (runtime === 'development' ? 'http://localhost:5173' : undefined);
    if (!from || !appBaseUrl) return { status: 'not_configured', sentAt: null, message: 'Account email delivery is unavailable.' };
    const url = new URL(input.path, appBaseUrl).toString();
    const subject = input.kind === 'verify' ? 'Verify your ZUR email' : 'Reset your ZUR password';
    const text = `${subject}: ${url}`;
    const message = { from, subject, text, html: `<p><a href="${url.replace(/[&<>"]/g, '')}">${subject}</a></p>` };
    if (provider === 'mock' && runtime !== 'production' && runtime !== 'staging' && mock) {
      mock.capture({ recipientEmail: input.recipientEmail, courseTitle: '', inviterName: '',
        invitationUrl: input.path, expiresAt: '' }, message);
      return { status: 'not_configured', sentAt: null, message: 'Account email captured in the local mock.' };
    }
    if (provider !== 'postmark' || !serverToken) return { status: 'not_configured', sentAt: null, message: 'Account email delivery is unavailable.' };
    try {
      const response = await (this.config.fetcher || fetch)('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: { 'X-Postmark-Server-Token': serverToken, Accept: 'application/json', 'Content-Type': 'application/json' },
        body: JSON.stringify({ From: from, To: input.recipientEmail, Subject: subject,
          TextBody: text, HtmlBody: message.html, MessageStream: 'outbound' }),
      });
      return response.ok
        ? { status: 'sent', sentAt: new Date().toISOString(), message: 'Account email accepted for delivery.' }
        : { status: 'failed', sentAt: null, message: 'Account email could not be delivered.' };
    } catch {
      return { status: 'failed', sentAt: null, message: 'Account email could not be delivered.' };
    }
  }

  private buildMessage(email: InvitationEmail, from: string, baseUrl: URL) {
    const joinUrl = new URL(email.invitationUrl, baseUrl).toString();
    const escapeHtml = (value: string) => value.replace(/[&<>"']/g, (char) => ({
      '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
    }[char]!));
    return {
      from,
      subject: `Invitation to ${email.courseTitle}`,
      text: `${email.inviterName} invited you to join ${email.courseTitle}. Accept the invitation: ${joinUrl}\n\nThis invitation expires ${email.expiresAt}.`,
      html: `<p>${escapeHtml(email.inviterName)} invited you to join <strong>${escapeHtml(email.courseTitle)}</strong>.</p><p><a href="${escapeHtml(joinUrl)}">Accept invitation</a></p><p>This invitation expires ${escapeHtml(email.expiresAt)}.</p>`,
    };
  }
}
