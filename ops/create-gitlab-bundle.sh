#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bundle_path="${1:-/private/tmp/fenrir-unified-gitlab.bundle}"

cd "$repo_root"

if ! git diff --quiet || ! git diff --cached --quiet; then
  cat >&2 <<'EOF'
Refusing to create bundle with uncommitted changes.
Commit or stash changes first, then rerun.
EOF
  exit 1
fi

bash ops/verify-layout.sh
git bundle create "$bundle_path" --all
git bundle verify "$bundle_path"

cat <<EOF

Bundle ready:
  $bundle_path

Import elsewhere:
  git clone "$bundle_path" fenrir-unified
  cd fenrir-unified
  git remote add origin <gitlab-remote-url>
  git push -u origin main
EOF
