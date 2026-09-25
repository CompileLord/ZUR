# Transactional email configuration

ZUR sends transactional account and invitation email through an approved provider. Production and staging use Postmark. Local development and integration tests default to an in-memory email mock; captured messages are process-local and are not sent to a recipient. The mock is refused when `NODE_ENV` is `production` or `staging`.

Set these environment variables for Postmark:

```sh
NODE_ENV=production
EMAIL_PROVIDER=postmark
POSTMARK_SERVER_TOKEN=your-postmark-server-token
EMAIL_FROM="ZUR <noreply@example.org>"
APP_BASE_URL=https://learn.example.org
```

Store `POSTMARK_SERVER_TOKEN` in the deployment secret manager. Do not put it in source control, command-line arguments, URLs, or logs. `EMAIL_FROM` must be a sender signature approved in Postmark, and `APP_BASE_URL` must be the public application origin.

If provider credentials or required sender/application configuration are absent, invitation delivery reports `not_configured`. A Postmark rejection or request failure reports `failed`. `sent` means Postmark accepted the request for delivery; it does not claim inbox delivery. In local mock mode the invitation is captured in memory, delivery reports `not_configured`, and the message says that no email was sent. In every case the invitation remains valid and its link can be copied by the author.

For a local process that should not capture messages, set `EMAIL_PROVIDER=postmark` without a token; the service reports `not_configured` and does not call an external provider.
