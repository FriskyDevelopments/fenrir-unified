#!/usr/bin/env bash
set -uo pipefail
echo "==> Fetch www.myfenrir.com landing HTML and extract auth wiring"
html="$(curl -s -L -m 20 https://www.myfenrir.com/ 2>/dev/null || echo '')"
echo "    bytes: ${#html}"
echo "    title: $(printf '%s' "$html" | grep -oiE '<title>[^<]*</title>' | head -1)"
echo "--- auth/workos/login references ---"
printf '%s' "$html" | grep -oiE '(https?:)?//[a-z0-9./_-]*(auth|workos|login|callback)[a-z0-9./_?=-]*' | sort -u | head -40
echo "--- client_ ids embedded ---"
printf '%s' "$html" | grep -oiE 'client_[A-Z0-9]{20,}' | sort -u | head
echo "--- next.js script chunks (to inspect server action / handlers) ---"
printf '%s' "$html" | grep -oiE '/_next/static/chunks/[a-z0-9._~-]+\.js' | sort -u | head -20
echo "--- data-testid login buttons / hrefs ---"
printf '%s' "$html" | grep -oiE 'href="[^"]*(login|auth|signin)[^"]*"' | sort -u | head
