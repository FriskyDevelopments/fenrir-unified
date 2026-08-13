#!/usr/bin/env bash
# Dummy put/get/delete round-trip against the MyFenrir R2 media bucket.
#
# Uses wrangler OAuth ONLY — no API token. Run this on a machine where you have
# already done `npx wrangler@4 login` (or will be prompted to). CLOUDFLARE_API_TOKEN
# is explicitly unset so wrangler cannot silently fall back to a pasted key.
#
#   bash ops/verify-r2-media.sh                # bucket defaults to myfenrir-media
#   bash ops/verify-r2-media.sh my-other-bucket
set -euo pipefail

BUCKET="${1:-myfenrir-media}"
KEY="_selftest/dummy-$(date -u +%Y%m%dT%H%M%SZ).txt"
SRC="$(mktemp)"
OUT="$(mktemp)"
trap 'rm -f "$SRC" "$OUT"' EXIT

printf 'myfenrir r2 selftest %s\n' "$(date -u +%FT%TZ)" > "$SRC"

echo "PUT    ${BUCKET}/${KEY}"
env -u CLOUDFLARE_API_TOKEN npx wrangler@4 r2 object put "${BUCKET}/${KEY}" --file="$SRC" --remote

echo "GET    ${BUCKET}/${KEY}"
env -u CLOUDFLARE_API_TOKEN npx wrangler@4 r2 object get "${BUCKET}/${KEY}" --file="$OUT" --remote
echo "  body: $(cat "$OUT")"

if ! diff -q "$SRC" "$OUT" >/dev/null; then
  echo "FAIL: round-trip bytes did not match" >&2
  exit 1
fi

echo "DELETE ${BUCKET}/${KEY}"
env -u CLOUDFLARE_API_TOKEN npx wrangler@4 r2 object delete "${BUCKET}/${KEY}" --remote

echo "OK: put/get/delete round-trip succeeded on ${BUCKET} (dummy object removed)"
