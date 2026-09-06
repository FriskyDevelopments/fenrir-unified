# Lock bot webhook rollout

The Pages route `/api/lock-bot/webhook` requires `LOCK_BOT_WEBHOOK_SECRET`.
It returns 500 when the binding is absent and 401 when Telegram's secret header
is absent or mismatched. Keep this fail-closed behavior. Code review and local
tests do not prove that the deployed binding or Telegram webhook is configured.

Before deploying this route:

1. Identify the separate Lock Bot with Telegram `getMe` and inspect `getWebhookInfo`.
   Record the current endpoint, allowed updates, pending update count and error
   metadata, excluding bot tokens and secret values. Do not use the MyFenrir
   Stars bot for this route.
2. Before deployment, provision `LOCK_BOT_WEBHOOK_SECRET`, `LOCK_BOT_DNS_SECRET`,
   and exactly one bot-token binding (`LOCK_BOT_TOKEN` or
   `FENRIR_LOCK_BOT_TOKEN`) as encrypted bindings in both the `fenrir-bridge`
   Cloudflare Pages production and preview environments through the approved
   secret manager. Use Telegram-compatible random webhook secrets
   (1–256 characters from `A-Z`, `a-z`, `0-9`, `_`, `-`). Keep values out of
   command arguments, logs, source files and review comments.
3. Confirm production and preview each use their intended bot and distinct
   secrets. Test preview using a separate test bot and its own secret. Telegram
   supports one webhook per bot: registering the
   production bot on preview would redirect production updates there.
4. Before release, register each intended bot using Telegram `setWebhook`, setting `url` to
   that environment's `/api/lock-bot/webhook`, `secret_token` to the exact bound
   value, and `allowed_updates` to `["message", "callback_query"]`. Preserve
   pending updates; do not enable `drop_pending_updates`. For an existing live
   bot, coordinate this step with deployment so its receiver accepts the new
   header before the fail-closed release becomes active.
5. Verify the deployed binding is active. A request without the header must
   return 401, and an authenticated empty update (`{}`) must return 200. If the
   unauthenticated request returns 500, the secret binding is missing in that
   deployment. Confirm a real test-bot update reaches the handler and inspect
   `getWebhookInfo` for the intended URL, new errors and pending-update progress.
   Telegram does not return `secret_token` from `getWebhookInfo`; URL inspection
   alone cannot prove the shared secret matches.
6. Preserve the previous working endpoint and secret reference for recovery.
   If delivery fails, restore the last authenticated deployment/webhook pair;
   do not remove the secret check to recover traffic.

Provisioning secrets, registering webhooks and deploying are release operations.
No live provisioning or Telegram registration is performed by the local tests.

## PR #23 metadata preflight (2026-09-06)

Read-only `wrangler pages secret list` checks for both production and preview
confirmed that `LOCK_BOT_WEBHOOK_SECRET`, `LOCK_BOT_DNS_SECRET`, and both possible
bot-token bindings are absent. Provision the two required secrets and exactly one
bot-token binding in both environments before deployment, then register the intended
Telegram webhook before release. The PR repair did not perform these release operations.

References: [Cloudflare Pages secrets](https://developers.cloudflare.com/pages/functions/bindings/#secrets),
[Telegram setWebhook](https://core.telegram.org/bots/api#setwebhook),
[Telegram getWebhookInfo](https://core.telegram.org/bots/api#getwebhookinfo).
