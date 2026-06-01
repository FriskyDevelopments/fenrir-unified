#!/usr/bin/env bash
# One-shot production deploy for fenrir-bridge.
#
# Why this exists: pasting multi-line command blocks into an interactive shell
# keeps tripping over comments, apostrophes, and placeholders. Run ONE command
# instead:  bash scripts/deploy-prod.sh
#
# Auth model: this repo deploys to Cloudflare Pages via Wrangler OAuth, NOT an
# API token. Do `deno run -A npm:wrangler@4.90.0 login` once in your browser
# first. CLOUDFLARE_API_TOKEN is intentionally stripped from the deploy calls.
#
# Secrets come from gitignored .env.local (create it with: npm run safe-box).
set -euo pipefail

cd "$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
WRANGLER="deno run -A npm:wrangler@4.90.0"
PROJECT="fenrir-bridge"

if [[ ! -f .env.local ]]; then
  echo "ERROR: .env.local not found. Run 'npm run safe-box' and fill in the WorkOS + Fenrir runtime groups first." >&2
  exit 1
fi

# Load secrets without echoing them.
set -a; # shellcheck disable=SC1091
source .env.local; set +a

required=(SESSION_SECRET WORKOS_CLIENT_ID WORKOS_API_KEY)
missing=()
for k in "${required[@]}"; do
  if [[ -z "${!k:-}" ]]; then missing+=("$k"); fi
done
if (( ${#missing[@]} )); then
  echo "ERROR: missing required secrets in .env.local: ${missing[*]}" >&2
  echo "Run 'npm run safe-box' and fill them in." >&2
  exit 1
fi

echo "==> Pushing ${#required[@]} secrets to Cloudflare Pages project '$PROJECT' (via OAuth)…"
for k in "${required[@]}"; do
  printf '%s' "${!k}" | env -u CLOUDFLARE_API_TOKEN $WRANGLER pages secret put "$k" --project-name "$PROJECT"
  echo "    set $k"
done

echo "==> Building and deploying…"
npm run deploy

echo "==> Verifying production…"
hz=$(curl -s -o /dev/null -w "%{http_code}" https://www.myfenrir.com/healthz || echo "ERR")
wo=$(curl -s -o /dev/null -w "%{http_code}" "https://auth.myfenrir.com/api/auth/workos/login?provider=google" || echo "ERR")
echo "    healthz: $hz   (expect 200)"
echo "    workos login: $wo   (expect 302)"

if [[ "$hz" == "200" && "$wo" == "302" ]]; then
  echo "==> DONE. Login broker is live."
else
  echo "==> Deploy ran, but verification did not return the expected codes. See notes above." >&2
  exit 2
fi
