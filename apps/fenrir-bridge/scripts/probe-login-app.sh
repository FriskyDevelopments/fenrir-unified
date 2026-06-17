#!/usr/bin/env bash
# Invoke the login.myfenrir.com Next.js server action (initiateLogin) and capture
# the exact WorkOS authorize URL + client_id it sends, then test that client_id
# against WorkOS. This reveals the real user-facing "Invalid client ID" cause.
set -uo pipefail

APP="https://login.myfenrir.com"
ACTION_ID="40c747329ae93f698d6461389833caab12bbbca75f"

echo "==> Probing $APP server action initiateLogin (provider=google)"

# Next.js server actions: POST to the page with the Next-Action header and the
# args as a JSON array body. The redirect target comes back either as a
# Location header, an x-action-redirect header, or inside the RSC body.
hdrs="$(curl -s -D - -o /tmp/body.txt -m 25 -X POST "$APP/" \
  -H "Next-Action: $ACTION_ID" \
  -H "Content-Type: text/plain;charset=UTF-8" \
  --data '[{"method":"oauth","provider":"google"}]' 2>/dev/null || echo '')"

echo "--- response status / redirect headers ---"
printf '%s\n' "$hdrs" | grep -iE '^HTTP/|^location:|^x-action-redirect:|^x-nextjs' | tr -d '\r' | head

body="$(cat /tmp/body.txt 2>/dev/null || echo '')"
# Extract any WorkOS authorize URL from headers or body.
authorize="$(printf '%s\n%s' "$hdrs" "$body" | grep -oiE 'https://api\.workos\.com/[a-z0-9./_-]*authorize[^" \)]*' | head -1)"
# Also catch redirects to login.workos.com / authkit domains.
[ -z "$authorize" ] && authorize="$(printf '%s\n%s' "$hdrs" "$body" | grep -oiE 'https://[a-z0-9.-]*workos[a-z0-9.-]*/[^" \)]*' | head -1)"

echo "--- extracted WorkOS URL ---"
echo "    ${authorize:-<none found>}"

if [ -n "$authorize" ]; then
  cid="$(printf '%s' "$authorize" | sed -n 's/.*[?&]client_id=\([^&]*\).*/\1/p')"
  rid_raw="$(printf '%s' "$authorize" | sed -n 's/.*[?&]redirect_uri=\([^&]*\).*/\1/p')"
  rid="$(printf '%b' "${rid_raw//%/\\x}")"
  echo "    client_id    = ${cid:-<none>}"
  echo "    redirect_uri = ${rid:-<none>}"

  if [ -n "$cid" ]; then
    echo "==> Testing this client_id against WorkOS"
    test_url="https://api.workos.com/user_management/authorize?client_id=${cid}&redirect_uri=$(printf '%s' "$rid_raw")&response_type=code&state=probe&provider=authkit"
    pb="$(curl -s -L -m 20 "$test_url" 2>/dev/null || echo '')"
    if printf '%s' "$pb" | grep -qiE 'invalid client|unrecognized client'; then
      echo "    VERDICT: INVALID client_id — WorkOS does not recognize it. THIS is the user-facing bug."
    elif printf '%s' "$pb" | grep -qiE 'redirect.?uri'; then
      echo "    VERDICT: client_id valid, redirect_uri NOT registered: $rid"
    elif printf '%s' "$pb" | grep -qiE 'authkit|sign in|continue with|password'; then
      echo "    VERDICT: client_id + redirect_uri OK (AuthKit renders)."
    else
      echo "    VERDICT: unclassified. First 300 chars:"; printf '%s\n' "${pb:0:300}"
    fi
  fi
else
  echo "--- first 600 chars of body for inspection ---"
  printf '%s\n' "${body:0:600}"
fi
