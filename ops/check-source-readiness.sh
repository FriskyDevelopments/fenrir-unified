#!/usr/bin/env bash
set -euo pipefail

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

check_source() {
  local label="$1"
  local src="$2"
  local required_file="$3"
  local file="$src/$required_file"

  if [ ! -d "$src" ]; then
    printf 'MISSING %-16s %s\n' "$label" "$src"
    return 1
  fi

  if [ ! -f "$file" ]; then
    printf 'MISSING %-16s %s\n' "$label" "$file"
    return 1
  fi

  if run_with_timeout 5 head -c 1 "$file" >/dev/null 2>&1; then
    printf 'READY   %-16s %s\n' "$label" "$src"
    return 0
  fi

  printf 'BLOCKED %-16s %s is not locally readable yet\n' "$label" "$file"
  return 1
}

fail=0
check_source "fenrir-bridge" "$bridge_src" "package.json" || fail=1
check_source "fenrir-cinema" "$cinema_src" "package.json" || fail=1
check_source "fenrir-portal" "$portal_src" "index.html" || fail=1

exit "$fail"
