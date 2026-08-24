#!/usr/bin/env bash
# Build and deploy only after the production runtime binding preflight passes.
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$APP_DIR"

# Nitro names this Worker from the monorepo path. This is the Worker currently
# bound to communities.myfenrir.com; do not fall back to the retired
# `community-bridge` Pages-era name or a successful deploy will miss production.
WORKER_NAME="${COMMUNITY_BRIDGE_WORKER_NAME:-frisky-developments-llc-fenrir-unified-fenrir-unified-apps-community-bridge}"
SITE_URL="https://communities.myfenrir.com"

# El Account ID es infraestructura, no código: vive como variable de CI, nunca
# en el repo. Sin fallback silencioso — desplegar contra la cuenta equivocada
# es peor que no desplegar.
if [ -z "${CLOUDFLARE_ACCOUNT_ID:-}" ]; then
  echo "ERROR: falta CLOUDFLARE_ACCOUNT_ID." >&2
  echo "  Defínela como variable de CI (Masked+Protected) o expórtala antes de" >&2
  echo "  ejecutar este script. No hay valor por defecto a propósito." >&2
  exit 1
fi
ACCOUNT_ID="$CLOUDFLARE_ACCOUNT_ID"

echo "==> Checking encrypted production bindings"
CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" COMMUNITY_BRIDGE_WORKER_NAME="$WORKER_NAME" node scripts/check-production-secrets.mjs

echo "==> Building $WORKER_NAME for $SITE_URL"
VITE_SITE_URL="$SITE_URL" npm run build

echo "==> Deploying $WORKER_NAME"
CLOUDFLARE_ACCOUNT_ID="$ACCOUNT_ID" npx wrangler --cwd .output deploy --name "$WORKER_NAME" --domain communities.myfenrir.com --keep-vars
