# Fenrir Alpha Secret Momentum

Infisical is intentionally out of the launch path for alpha. The current
momentum path stores the same required secrets in three places:

- Cloudflare Pages project secrets
- Google Secret Manager
- 1Password

Required alpha secrets:

- `TELEGRAM_BOT_TOKEN`: BotFather token used by the Telegram bot.
- `TELEGRAM_WEBHOOK_SECRET`: shared verification secret for Telegram webhook requests.
- `FRISKY_BOT_API_TOKEN`: unified Frisky service token for MCP/specialist calls and Frisky-backed bot workflows. Telegram BotFather tokens only cover Telegram transport.

Run the protected local intake:

```bash
cd /Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-bridge
chmod +x scripts/sync-alpha-secrets.sh
./scripts/sync-alpha-secrets.sh
```

Optional environment overrides:

```bash
CLOUDFLARE_PAGES_PROJECT=fenrir-bridge
ENVIRONMENT=production
GCP_PROJECT=your-gcp-project-id
OP_VAULT=Private
OP_ITEM="Fenrir Alpha Secrets"
```

Do not paste these secrets into chat, issue comments, or terminal commands that
will be saved in shell history. The script prompts with hidden input and does not
print the values.

After alpha is stable, revisit Infisical with clean project structure and syncs.
