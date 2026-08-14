#!/usr/bin/env bash
#
# Deploy Community Bridge to the Quality Worker.
#
# Two things were being lost by deploying with a bare `vite build && wrangler
# deploy`, so they are pinned here:
#
#   1. VITE_SITE_URL — site-url.ts falls back to http://localhost:5173 during
#      SSR when this is unset. Every deployed page was emitting
#      <link rel="canonical"> and og:url pointing at localhost, so link
#      previews and crawlers saw a dev origin.
#   2. VITE_TELEGRAM_BOT_USERNAME — Quality must never generate links or QR
#      codes for the production bot.
#   3. --name — nitro auto-generates a worker name from the directory path
#      ("frisky-developments-llc-fenrir-unified-..."), which is not the
#      Quality worker. The name must be stated explicitly.
#
# Quality only. This never touches production hosts, DNS, or Stripe mode.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

WORKER_NAME="community-bridge-quality"
SITE_URL="https://quality.communities.myfenrir.com"
TELEGRAM_DEV_BOT_USERNAME="${VITE_TELEGRAM_BOT_USERNAME:-Myfenrirdevbot}"
ACCOUNT_ID="${CLOUDFLARE_ACCOUNT_ID:-e2a7eccb24c4836847fd14d08c499bd0}"

echo "==> Building $WORKER_NAME for $SITE_URL with DEV bot @$TELEGRAM_DEV_BOT_USERNAME"
VITE_SITE_URL="$SITE_URL" VITE_TELEGRAM_BOT_USERNAME="$TELEGRAM_DEV_BOT_USERNAME" npx vite build

echo "==> Deploying to $WORKER_NAME"
CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" npx wrangler deploy \
  --config .output/server/wrangler.json \
  --name "$WORKER_NAME" \
  "$@"

echo "==> Deployed. Verify canonical is no longer localhost:"
echo "    curl -s $SITE_URL/g/<slug> | grep -o 'rel=\"canonical\" href=\"[^\"]*\"'"
