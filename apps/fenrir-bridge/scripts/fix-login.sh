#!/usr/bin/env bash
# fix-login.sh — one-shot, no-iteration fix for myfenrir.com login.
#
# Run once:  bash scripts/fix-login.sh
#
# It will:
#   1. prompt you (hidden input) for the two WorkOS values — copy BOTH from the
#      SAME WorkOS dashboard "API Keys" page so they match,
#   2. generate a SESSION_SECRET,
#   3. set all three as Cloudflare Pages secrets on fenrir-bridge,
#   4. build and deploy to production,
#   5. verify the live endpoints and print PASS/FAIL.
#
# Nothing you type is shown on screen or written to shell history.
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PROJECT="fenrir-bridge"

echo "==> Paste your WorkOS values (input is hidden). Get BOTH from the same"
echo "    WorkOS dashboard -> API Keys page so they are from one environment."
printf "WORKOS_API_KEY (sk_...): "; read -rs WORKOS_API_KEY; echo
printf "WORKOS_CLIENT_ID (client_...): "; read -rs WORKOS_CLIENT_ID; echo

if [ -z "${WORKOS_API_KEY}" ] || [ -z "${WORKOS_CLIENT_ID}" ]; then
  echo "ERROR: both values are required. Nothing changed." >&2
  exit 1
fi
SESSION_SECRET="$(openssl rand -base64 48)"

echo "==> Setting the three production secrets on '$PROJECT'..."
printf '%s' "$WORKOS_API_KEY"   | npx wrangler pages secret put WORKOS_API_KEY   --project-name="$PROJECT"
printf '%s' "$WORKOS_CLIENT_ID" | npx wrangler pages secret put WORKOS_CLIENT_ID --project-name="$PROJECT"
printf '%s' "$SESSION_SECRET"   | npx wrangler pages secret put SESSION_SECRET   --project-name="$PROJECT"

echo "==> Building..."
npm run build

echo "==> Deploying to production..."
npx wrangler pages deploy dist --project-name="$PROJECT" --branch=main --commit-dirty=true

echo "==> Verifying live endpoints..."
sleep 3
hz="$(curl -s -o /dev/null -w '%{http_code}' https://www.myfenrir.com/healthz || echo ERR)"
wo="$(curl -s -o /dev/null -w '%{http_code}' 'https://auth.myfenrir.com/api/auth/workos/login?provider=google' || echo ERR)"
echo "    healthz       = $hz   (want 200)"
echo "    workos login  = $wo   (want 302 -> redirect to WorkOS)"
echo
if [ "$hz" = "200" ] && [ "$wo" = "302" ]; then
  echo "PASS — login is wired and live. Open https://www.myfenrir.com and sign in."
else
  echo "NOT YET. If workos login = 410/500, the secrets/redirect URI need a look."
  echo "Make sure the WorkOS dashboard redirect URI is exactly:"
  echo "  https://auth.myfenrir.com/api/auth/callback/workos"
  exit 2
fi
