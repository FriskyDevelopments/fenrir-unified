#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
project_path="${1:-}"

cd "$repo_root"

if [ -z "$project_path" ]; then
  cat >&2 <<'EOF'
Usage:
  bash ops/create-gitlab-project-and-push.sh <namespace/fenrir-unified>

Examples:
  bash ops/create-gitlab-project-and-push.sh FriskyDevelopments/fenrir-unified
  bash ops/create-gitlab-project-and-push.sh aroo/fenrir-unified

This uses the local glab auth config, creates a private GitLab project, sets
origin, pushes main, and then runs the readiness audit.
EOF
  exit 2
fi

if ! command -v glab >/dev/null 2>&1; then
  echo "glab CLI is required but was not found." >&2
  exit 1
fi

bash ops/verify-layout.sh
node --check apps/fenrir-bridge/workers/fenrir-mcp-beta.js

if ! git diff --quiet || ! git diff --cached --quiet; then
  echo "Refusing to create/push with uncommitted changes." >&2
  exit 1
fi

glab repo create "$project_path" \
  --private \
  --defaultBranch main \
  --description "Unified Fenrir / MyFenrir source tree, GitLab seed, and handoff bundle." \
  --remoteName origin

git push -u origin main
bash ops/audit-gitlab-readiness.sh
