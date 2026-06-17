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

# Capture the WorkOS authorize URL the live app actually emits (the 302 Location),
# then decode the exact client_id + redirect_uri it sends. This is the single
# most useful signal: "Invalid client ID" from WorkOS means one of these two is
# wrong, so we print them for direct comparison against the WorkOS dashboard.
login_url='https://auth.myfenrir.com/api/auth/workos/login?provider=google'
wo="$(curl -s -o /dev/null -w '%{http_code}' "$login_url" || echo ERR)"
authorize="$(curl -s -o /dev/null -w '%{redirect_url}' "$login_url" || echo '')"

sent_client_id="$(printf '%s' "$authorize" | sed -n 's/.*[?&]client_id=\([^&]*\).*/\1/p')"
sent_redirect="$(printf '%s' "$authorize" | sed -n 's/.*[?&]redirect_uri=\([^&]*\).*/\1/p')"
# URL-decode the redirect_uri for readability.
sent_redirect="$(printf '%b' "${sent_redirect//%/\\x}")"

echo "    healthz       = $hz   (want 200)"
echo "    workos login  = $wo   (want 302 -> redirect to WorkOS)"
echo
echo "    --- exactly what the live site sends to WorkOS ---"
echo "    client_id     = ${sent_client_id:-<none>}"
echo "    redirect_uri  = ${sent_redirect:-<none>}"
echo "    expected      = https://auth.myfenrir.com/api/auth/callback/workos"
echo

# Follow the authorize URL once to see whether WorkOS accepts it. WorkOS renders
# "Invalid client ID" in the page body when the client_id is unknown, and a
# distinct redirect-uri message when only the redirect is unregistered.
verdict="unknown"
if [ -n "$authorize" ]; then
  body="$(curl -s -L "$authorize" || echo '')"
  if printf '%s' "$body" | grep -qiE 'invalid client|client[_ ]id'; then
    verdict="invalid_client_id"
  elif printf '%s' "$body" | grep -qiE 'redirect[_ ]uri'; then
    verdict="redirect_uri_not_allowed"
  elif [ -n "$body" ]; then
    verdict="authkit_ok"
  fi
fi

if [ "$hz" = "200" ] && [ "$wo" = "302" ] && [ "$verdict" = "authkit_ok" ]; then
  echo "PASS — login is wired, deployed, and WorkOS accepts the request."
  echo "Open https://www.myfenrir.com and sign in."
  exit 0
fi

echo "NOT YET — WorkOS verdict: $verdict"
case "$verdict" in
  invalid_client_id)
    echo "  The client_id above is not recognized by WorkOS. Open the WorkOS"
    echo "  dashboard, select the SAME environment your sk_/client_ keys came"
    echo "  from, and confirm the 'Client ID' on the Configuration page matches"
    echo "  the value printed above CHARACTER-FOR-CHARACTER (no extra spaces,"
    echo "  no Staging-vs-Production mix-up). Re-run this script with the"
    echo "  correct WORKOS_CLIENT_ID."
    ;;
  redirect_uri_not_allowed)
    echo "  The client_id is valid but the redirect URI is not registered."
    echo "  In WorkOS -> Redirects, add exactly:"
    echo "    https://auth.myfenrir.com/api/auth/callback/workos"
    ;;
  *)
    echo "  If workos login = 410/500, the secrets need a look. Make sure the"
    echo "  WorkOS redirect URI is exactly:"
    echo "    https://auth.myfenrir.com/api/auth/callback/workos"
    ;;
esac
exit 2
