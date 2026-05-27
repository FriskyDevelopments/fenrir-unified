#!/usr/bin/env bash
set -euo pipefail

repo_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

bridge_src="${FENRIR_BRIDGE_SRC:-/Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-bridge}"
cinema_src="${FENRIR_CINEMA_SRC:-/Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-cinema}"
portal_src="${FENRIR_PORTAL_SRC:-/Users/friskypup/Documents/Playground/experiments/fenrir-portal}"
bridge_fallback_src="${FENRIR_BRIDGE_FALLBACK_SRC:-/private/tmp/fenrir-current-build}"
bridge_overlay_src="${FENRIR_BRIDGE_OVERLAY_SRC:-/private/tmp/fenrir-bridge-local}"

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

apply_bridge_local_fixes() {
  local pkg="$repo_root/apps/fenrir-bridge/package.json"

  [ -f "$pkg" ] || return 0

  node - "$pkg" <<'NODE'
const fs = require("fs");
const path = process.argv[2];
const pkg = JSON.parse(fs.readFileSync(path, "utf8"));
pkg.scripts ||= {};
const wrap = (cmd) => `bash scripts/run-with-node-lts.sh ${cmd}`;
pkg.scripts.dev = wrap("vite --host 0.0.0.0");
pkg.scripts.build = wrap("vite build");
pkg.scripts.typecheck = wrap("tsc --noEmit");
if (pkg.scripts["test:auth-redirect"]) {
  pkg.scripts["test:auth-redirect"] = wrap("node scripts/test-auth-redirect.mjs");
}
if (pkg.scripts["verify:readiness"]) {
  pkg.scripts["verify:readiness"] = wrap("node scripts/verify-readiness.mjs");
}
for (const name of ["safe-box", "bugbug:trial", "bugbug:auth"]) {
  if (pkg.scripts[name]) {
    const original = pkg.scripts[name].replace(/^node /, "node ");
    pkg.scripts[name] = wrap(original);
  }
}
for (const name of ["postinstall", "predev", "pretypecheck"]) {
  if (pkg.scripts[name]) {
    pkg.scripts[name] = wrap("node scripts/clean-icloud-dupes.mjs");
  }
}
fs.writeFileSync(path, `${JSON.stringify(pkg, null, 2)}\n`);
NODE
}

if copy_project "$bridge_src" "$repo_root/apps/fenrir-bridge" "package.json"; then
  :
elif [ -d "$bridge_fallback_src" ]; then
  printf 'Using readable Fenrir Bridge fallback: %s\n' "$bridge_fallback_src" >&2
  copy_project "$bridge_fallback_src" "$repo_root/apps/fenrir-bridge" "package.json"
else
  exit 1
fi

if [ -d "$bridge_overlay_src" ]; then
  printf 'Overlaying Fenrir Bridge local repair copy: %s\n' "$bridge_overlay_src" >&2
  copy_project "$bridge_overlay_src" "$repo_root/apps/fenrir-bridge" "package.json" || true
fi
apply_bridge_local_fixes

copy_project "$cinema_src" "$repo_root/apps/fenrir-cinema" "package.json"
copy_project "$portal_src" "$repo_root/legacy/fenrir-portal" "index.html"

printf 'Fenrir source materialized into %s\n' "$repo_root"
