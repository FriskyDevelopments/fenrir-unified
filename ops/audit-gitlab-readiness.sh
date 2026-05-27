#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
bundle_path="${1:-/private/tmp/fenrir-unified-gitlab.bundle}"

cd "$repo_root"

failures=0

check() {
  local label="$1"
  shift
  if "$@" >/tmp/fenrir-audit-check.out 2>&1; then
    printf "OK      %s\n" "$label"
  else
    printf "MISSING %s\n" "$label"
    sed 's/^/        /' /tmp/fenrir-audit-check.out
    failures=$((failures + 1))
  fi
}

check "layout verifier" bash ops/verify-layout.sh
check "mcp worker syntax" node --check apps/fenrir-bridge/workers/fenrir-mcp-beta.js
check "clean git worktree" bash -c 'git diff --quiet && git diff --cached --quiet'
check "git bundle exists" test -f "$bundle_path"
check "git bundle verifies" git bundle verify "$bundle_path"

if remote_url="$(git remote get-url origin 2>/dev/null)"; then
  printf "OK      origin remote configured: %s\n" "$remote_url"
  case "$remote_url" in
    *gitlab.com*|*gitlab*) printf "OK      origin looks GitLab-like\n" ;;
    *)
      printf "MISSING origin does not look GitLab-like\n"
      failures=$((failures + 1))
      ;;
  esac
else
  printf "MISSING origin remote configured\n"
  failures=$((failures + 1))
fi

if upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null)"; then
  printf "OK      main upstream configured: %s\n" "$upstream"
else
  printf "MISSING main upstream configured\n"
  failures=$((failures + 1))
fi

if [ "$failures" -ne 0 ]; then
  cat <<'EOF'

GitLab readiness is not complete yet.
Next required action:
  bash ops/configure-gitlab-remote.sh <gitlab-remote-url>
  git push -u origin main
  bash ops/audit-gitlab-readiness.sh
EOF
  exit 1
fi

cat <<'EOF'

GitLab readiness complete.
EOF
