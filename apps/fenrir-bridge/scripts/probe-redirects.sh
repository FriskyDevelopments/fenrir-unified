#!/usr/bin/env bash
# Probe whether candidate redirect URIs are registered in WorkOS for the VALID
# client id. This tells us if a self-contained replacement app on
# login.myfenrir.com could use its own callback without dashboard access.
set -uo pipefail

CID="client_01KT7NWYWB256XP0V00PX1YW01"   # proven-valid client id
echo "==> Probing redirect registration for $CID"

for cand in \
  "https://login.myfenrir.com/auth/callback" \
  "https://login.myfenrir.com/api/auth/callback" \
  "https://login.myfenrir.com/callback" \
  "https://login.myfenrir.com/api/auth/callback/workos" \
  "http://localhost:3000/auth/callback" ; do
  enc="$(printf '%s' "$cand" | sed 's|:|%3A|g; s|/|%2F|g')"
  url="https://api.workos.com/user_management/authorize?client_id=${CID}&redirect_uri=${enc}&response_type=code&state=probe&provider=authkit"
  pb="$(curl -s -L -m 20 "$url" 2>/dev/null || echo '')"
  if printf '%s' "$pb" | grep -qiE 'redirect.?uri'; then
    verdict="NOT registered"
  elif printf '%s' "$pb" | grep -qiE 'invalid client'; then
    verdict="client rejected"
  elif printf '%s' "$pb" | grep -qiE 'authkit|sign in|continue with|password|email'; then
    verdict="REGISTERED (AuthKit renders)"
  else
    verdict="unknown"
  fi
  printf '    %-52s -> %s\n' "$cand" "$verdict"
done
