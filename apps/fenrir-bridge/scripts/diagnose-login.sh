#!/usr/bin/env bash
# diagnose-login.sh — read-only, credential-free diagnosis of the live login.
#
# Runs anywhere with outbound network (e.g. a GitLab CI runner). It does NOT
# need a Cloudflare token or any secret. It answers one question definitively:
# WHY does WorkOS reject the login, "Invalid client ID" or an unregistered
# redirect URI — by reading exactly what the live site sends to WorkOS.
set -uo pipefail

AUTH_HOST="${AUTH_HOST:-https://auth.myfenrir.com}"
SITE_HOST="${SITE_HOST:-https://www.myfenrir.com}"
LOGIN_URL="${AUTH_HOST}/api/auth/workos/login?provider=google"
EXPECT_REDIRECT="${AUTH_HOST}/api/auth/callback/workos"

echo "==> Live login diagnosis (no credentials used)"
echo "    login endpoint : $LOGIN_URL"
echo

hz="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "${SITE_HOST}/healthz" 2>/dev/null || echo ERR)"
code="$(curl -s -o /dev/null -m 15 -w '%{http_code}' "$LOGIN_URL" 2>/dev/null || echo ERR)"
authorize="$(curl -s -o /dev/null -m 15 -w '%{redirect_url}' "$LOGIN_URL" 2>/dev/null || echo '')"

echo "    healthz        = $hz    (want 200)"
echo "    login status   = $code  (want 302 -> WorkOS)"
echo "    authorize URL  = ${authorize:-<none>}"
echo

if [ -z "$authorize" ]; then
  echo "RESULT: the login endpoint did not redirect to WorkOS."
  echo "  status $code usually means WorkOS secrets are missing (410) or the"
  echo "  server threw (500). Set WORKOS_CLIENT_ID + WORKOS_API_KEY + SESSION_SECRET."
  exit 1
fi

# Decode the exact values the live app sends to WorkOS.
client_id="$(printf '%s' "$authorize" | sed -n 's/.*[?&]client_id=\([^&]*\).*/\1/p')"
redirect_raw="$(printf '%s' "$authorize" | sed -n 's/.*[?&]redirect_uri=\([^&]*\).*/\1/p')"
redirect="$(printf '%b' "${redirect_raw//%/\\x}")"

echo "    --- exactly what the live site sends to WorkOS ---"
echo "    client_id      = ${client_id:-<none>}"
echo "    redirect_uri   = ${redirect:-<none>}"
echo "    redirect should= $EXPECT_REDIRECT"
echo

if [ "$redirect" != "$EXPECT_REDIRECT" ]; then
  echo "  NOTE: redirect_uri does not match the expected callback. The deployed"
  echo "  build predates the redirect-uri fix on branch claude/fenrir-login-debug-VUzrn."
  echo
fi

# Follow the authorize URL to WorkOS and classify the response.
body="$(curl -s -L -m 20 "$authorize" 2>/dev/null || echo '')"
verdict="unknown"
if printf '%s' "$body" | grep -qiE 'invalid client|unrecognized client|client.?id.*not'; then
  verdict="invalid_client_id"
elif printf '%s' "$body" | grep -qiE 'redirect.?uri'; then
  verdict="redirect_uri_not_allowed"
elif printf '%s' "$body" | grep -qiE 'authkit|sign in|continue with|password|email'; then
  verdict="authkit_ok"
fi

echo "==> WorkOS verdict: $verdict"
case "$verdict" in
  authkit_ok)
    echo "  WorkOS ACCEPTS this request — the AuthKit sign-in screen renders."
    echo "  If users still fail, the problem is AFTER WorkOS (callback/session),"
    echo "  not the client_id."
    exit 0
    ;;
  invalid_client_id)
    echo "  WorkOS does NOT recognize the client_id above. This is the failure."
    echo "  Fix: in the WorkOS dashboard, open the SAME environment your API key"
    echo "  belongs to, and confirm the Client ID matches the value above"
    echo "  character-for-character. Common causes: Staging-vs-Production mix-up,"
    echo "  a trailing space in the secret, or a deleted environment."
    exit 2
    ;;
  redirect_uri_not_allowed)
    echo "  client_id is valid; the redirect_uri above is not registered."
    echo "  Fix: WorkOS dashboard -> Redirects -> add exactly:"
    echo "    $EXPECT_REDIRECT"
    exit 2
    ;;
  *)
    echo "  Could not classify the WorkOS response. First 400 chars follow:"
    printf '%s\n' "${body:0:400}"
    exit 3
    ;;
esac
