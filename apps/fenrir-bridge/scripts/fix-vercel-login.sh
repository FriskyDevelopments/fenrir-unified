#!/usr/bin/env bash
# fix-vercel-login.sh — fix the REAL user-facing login bug.
#
# Diagnosis (proven by CI probes, see scripts/diagnose-login.sh + probe-login-app.sh):
#   * Users hit  www.myfenrir.com (Vercel) -> login button -> login.myfenrir.com (Vercel).
#   * login.myfenrir.com's server action sends WorkOS:
#         client_id    = client_replace_me          <-- UNREPLACED PLACEHOLDER
#         redirect_uri = http://localhost:3000/...   <-- LOCALHOST PLACEHOLDER
#     => WorkOS returns "Invalid client ID".
#   * The separate Cloudflare app auth.myfenrir.com uses the VALID id
#         client_01KT7NWYWB256XP0V00PX1YW01  (WorkOS renders AuthKit) but is NOT
#     in the user's path.
#
# This script sets the correct WorkOS env vars on the Vercel `myfenrir-login`
# project and redeploys. Run it where the Vercel CLI is logged in to the
# pupfrs-projects team. Input for the API key is hidden.
set -euo pipefail

PROJECT="myfenrir-login"
TEAM="pupfrs-projects"
VALID_CLIENT_ID="client_01KT7NWYWB256XP0V00PX1YW01"   # proven valid against WorkOS
REDIRECT="https://login.myfenrir.com/auth/callback"    # must be registered in WorkOS

command -v vercel >/dev/null || { echo "Install the Vercel CLI: npm i -g vercel"; exit 1; }

echo "==> WorkOS API key for the SAME environment as $VALID_CLIENT_ID (hidden):"
printf "WORKOS_API_KEY (sk_...): "; read -rs WORKOS_API_KEY; echo
[ -n "$WORKOS_API_KEY" ] || { echo "API key required."; exit 1; }

# Cookie password is required by the AuthKit Next.js SDK (>=32 chars).
COOKIE_PW="$(openssl rand -base64 32)"

set_env () { # name value
  # Remove any existing value, then add for production. Ignore "not found".
  vercel env rm "$1" production --yes --scope "$TEAM" >/dev/null 2>&1 || true
  printf '%s' "$2" | vercel env add "$1" production --scope "$TEAM" >/dev/null
  echo "   set $1"
}

echo "==> Linking project $PROJECT ..."
vercel link --project "$PROJECT" --scope "$TEAM" --yes >/dev/null

echo "==> Writing production env vars ..."
# The app reads these names (WorkOS AuthKit Next.js SDK convention). If the repo
# uses different names, set those too — but these are the SDK defaults.
set_env WORKOS_CLIENT_ID    "$VALID_CLIENT_ID"
set_env WORKOS_API_KEY      "$WORKOS_API_KEY"
set_env WORKOS_REDIRECT_URI "$REDIRECT"
set_env WORKOS_COOKIE_PASSWORD "$COOKIE_PW"
set_env NEXT_PUBLIC_WORKOS_REDIRECT_URI "$REDIRECT"

echo "==> Redeploying production ..."
vercel deploy --prod --scope "$TEAM" --yes

cat <<EOF

==> In the WorkOS dashboard (same environment as the client id above), under
    Redirects, make sure this EXACT URI is allowed:
      $REDIRECT

==> Verify (no secrets needed): re-run the GitLab 'diagnose-login' job, or:
      curl -s -X POST https://login.myfenrir.com/ \\
        -H 'Next-Action: 40c747329ae93f698d6461389833caab12bbbca75f' \\
        -H 'Content-Type: text/plain;charset=UTF-8' \\
        --data '[{"method":"oauth","provider":"google"}]' -D - -o /dev/null \\
      | grep -i x-action-redirect
    The client_id in that redirect must be $VALID_CLIENT_ID (NOT client_replace_me).
EOF
