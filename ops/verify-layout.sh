#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
fail=0

require_path() {
  local path="$1"
  if [ ! -e "$repo_root/$path" ]; then
    printf 'MISSING %s\n' "$path"
    fail=1
  else
    printf 'OK      %s\n' "$path"
  fi
}

require_path "apps/fenrir-bridge/package.json"
require_path "apps/fenrir-bridge/src"
require_path "apps/fenrir-bridge/functions"
require_path "apps/fenrir-bridge/workers"
require_path "apps/fenrir-bridge/docs"
require_path "apps/fenrir-cinema/package.json"
require_path "apps/fenrir-cinema/src"
require_path "docs/architecture/FENRIR_CONSOLIDATION_MAP.md"

if find "$repo_root" -path '*/node_modules' -o -path '*/dist' -o -path '*/build' -o -path '*/out' -o -name '.env.local' | grep -q .; then
  printf 'FAIL generated or secret-local files are present\n'
  fail=1
fi

exit "$fail"
