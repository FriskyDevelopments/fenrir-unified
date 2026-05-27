#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bridge_src="${FENRIR_BRIDGE_SRC:-/Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-bridge}"
cinema_src="${FENRIR_CINEMA_SRC:-/Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-cinema}"
portal_src="${FENRIR_PORTAL_SRC:-/Users/friskypup/Documents/Playground/experiments/fenrir-portal}"

run_with_timeout() {
  local seconds="$1"
  shift

  perl -e '
    my ($timeout, @cmd) = @ARGV;
    my $pid = fork();
    die "fork failed: $!" unless defined $pid;
    if ($pid == 0) {
      exec @cmd;
      exit 127;
    }
    local $SIG{ALRM} = sub {
      kill "TERM", $pid;
      sleep 1;
      kill "KILL", $pid;
      waitpid($pid, 0);
      exit 124;
    };
    alarm $timeout;
    waitpid($pid, 0);
    my $status = $?;
    alarm 0;
    exit($status >> 8) if $status >= 256;
    exit(128 + $status) if $status > 0;
    exit 0;
  ' "$seconds" "$@"
}

check_readable_file() {
  local file="$1"

  if [ ! -f "$file" ]; then
    printf 'MISSING required source file: %s\n' "$file" >&2
    return 1
  fi

  if ! run_with_timeout 5 head -c 1 "$file" >/dev/null 2>&1; then
    printf 'BLOCKED source file is not locally readable yet: %s\n' "$file" >&2
    printf 'Hint: hydrate/download the source folder in Finder or the cloud provider before retrying.\n' >&2
    return 1
  fi
}

copy_project() {
  local src="$1"
  local dest="$2"
  local required_file="$3"

  if [ ! -d "$src" ]; then
    printf 'SKIP missing source: %s\n' "$src" >&2
    return 0
  fi

  check_readable_file "$src/$required_file"

  mkdir -p "$dest"
  rsync -a \
    --exclude '.git/' \
    --exclude 'node_modules/' \
    --exclude 'dist/' \
    --exclude 'build/' \
    --exclude 'out/' \
    --exclude '.vercel/' \
    --exclude '.wrangler/' \
    --exclude '.pytest_cache/' \
    --exclude 'artifacts/' \
    --exclude '.DS_Store' \
    --include '.env.example' \
    --exclude '.env' \
    --exclude '.env.*' \
    --exclude '*.log' \
    "$src/" "$dest/"
}

copy_project "$bridge_src" "$repo_root/apps/fenrir-bridge" "package.json"
copy_project "$cinema_src" "$repo_root/apps/fenrir-cinema" "package.json"
copy_project "$portal_src" "$repo_root/legacy/fenrir-portal" "index.html"

printf 'Fenrir source materialized into %s\n' "$repo_root"
