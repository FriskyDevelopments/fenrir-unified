#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
wrangler_version="4.90.0"
configs=(
  "wrangler.fenrir-mcp-beta.toml"
  "wrangler.fenrir-gate-router.toml"
  "wrangler.fenrir-stars.toml"
  "wrangler.fenrir-auth.jsonc"
  "wrangler.fenrir-auth-proxy.toml"
  "wrangler.fenrir-direct-oauth-guard.toml"
)

cd "$repo_root"
for config in "${configs[@]}"; do
  bash scripts/guard-wrangler-deploy.sh \
    env -u CLOUDFLARE_API_TOKEN \
    deno run -A "npm:wrangler@$wrangler_version" deploy --config "$config"
done
