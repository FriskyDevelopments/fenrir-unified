#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

if ! bash "$repo_root/scripts/check-cloudflare-tooling.sh"; then
  cat <<'EOF' >&2

Blocked before deploy: Wrangler fetch/network checks are failing.
Production is safer with no new Wrangler deployment than with a half-broken deploy attempt.
EOF
  exit 1
fi

exec "$@"
