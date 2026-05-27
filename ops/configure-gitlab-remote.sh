#!/usr/bin/env bash
set -euo pipefail

if [ "$#" -ne 1 ]; then
  cat >&2 <<'EOF'
Usage:
  bash ops/configure-gitlab-remote.sh <gitlab-remote-url>

Example:
  bash ops/configure-gitlab-remote.sh git@gitlab.com:FriskyDevelopments/fenrir-unified.git
EOF
  exit 2
fi

remote_url="$1"

if git remote get-url origin >/dev/null 2>&1; then
  git remote set-url origin "$remote_url"
else
  git remote add origin "$remote_url"
fi

git remote -v

cat <<'EOF'

Remote configured. Push when ready:
  git push -u origin main
EOF
