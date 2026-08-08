#!/usr/bin/env bash
# Fix: Remove Vercel DNS + add alpha/gate.myfenrir.com
# Usage: CF_API_TOKEN=xxx ./scripts/fix-dns-vercel-cleanup.sh
set -euo pipefail

ZONE_ID="357ccb8e0bfa8d2f370ed712650c8a12"
TOKEN="${CF_API_TOKEN:-${CLOUDFLARE_API_TOKEN:-}}"

if [ -z "$TOKEN" ]; then
  echo "Set CF_API_TOKEN env var (needs Zone.DNS:Edit on myfenrir.com)"
  echo "Get one: https://dash.cloudflare.com/profile/api-tokens"
  exit 1
fi

echo "Finding Vercel DNS record for login.myfenrir.com..."
RECORD=$(curl -sf \
  "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records?type=CNAME&name=login.myfenrir.com" \
  -H "Authorization: Bearer ${TOKEN}" \
  -H "Content-Type: application/json")

RECORD_ID=$(echo "$RECORD" | python3 -c "
import sys, json
d = json.load(sys.stdin)
results = d.get('result', [])
print(results[0]['id'] if d.get('success') and results else '')
")

if [ -n "$RECORD_ID" ]; then
  echo "Deleting Vercel CNAME..."
  curl -sf -X DELETE \
    "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records/${RECORD_ID}" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" > /dev/null
  echo "Deleted login.myfenrir.com Vercel record"
else
  echo "No Vercel CNAME found (already clean?)"
fi

for sub in alpha gate; do
  echo "Creating ${sub}.myfenrir.com..."
  RESULT=$(curl -sf -X POST \
    "https://api.cloudflare.com/client/v4/zones/${ZONE_ID}/dns_records" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Content-Type: application/json" \
    --data "{\"type\":\"CNAME\",\"name\":\"${sub}\",\"content\":\"fenrir-bridge.pages.dev\",\"proxied\":true,\"ttl\":1}")
  OK=$(echo "$RESULT" | python3 -c "import sys,json; print('yes' if json.load(sys.stdin).get('success') else 'no')")
  echo "  ${sub}.myfenrir.com: $([ "$OK" = "yes" ] && echo 'CREATED' || echo 'FAILED (may already exist)')"
done

echo "Done. Verify: dig +short alpha.myfenrir.com"
