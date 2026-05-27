#!/usr/bin/env bash
set -euo pipefail

TIMEOUT_SECONDS="${CLOUDFLARE_TOOLING_TIMEOUT_SECONDS:-15}"
WRANGLER_CMD="${WRANGLER_CMD:-deno run -A npm:wrangler@4.90.0}"
NODE_CMD="${NODE_CMD:-node}"

if [ "$NODE_CMD" = "node" ]; then
  if [ -x /opt/homebrew/opt/node@22/bin/node ]; then
    NODE_CMD="/opt/homebrew/opt/node@22/bin/node"
  elif [ -x /usr/local/opt/node@22/bin/node ]; then
    NODE_CMD="/usr/local/opt/node@22/bin/node"
  fi
fi

tmpdir="$(mktemp -d)"
cleanup() {
  rm -rf "$tmpdir"
}
trap cleanup EXIT

run_with_timeout() {
  local label="$1"
  local outfile="$2"
  shift 2

  if perl -e '
    my ($timeout, $outfile, @cmd) = @ARGV;
    my $pid = fork();
    die "fork failed: $!" unless defined $pid;
    if ($pid == 0) {
      open STDOUT, ">", $outfile or die "open $outfile failed: $!";
      open STDERR, ">&STDOUT" or die "redirect stderr failed: $!";
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
  ' "$TIMEOUT_SECONDS" "$outfile" "$@"; then
    return 0
  fi

  local status="$?"
  if [ "$status" -eq 124 ]; then
    printf 'FAIL %s timed out after %ss\n' "$label" "$TIMEOUT_SECONDS"
    return 124
  fi

  return "$status"
}

check_curl() {
  local code
  code="$(curl -sS -o /dev/null -w '%{http_code}' --max-time "$TIMEOUT_SECONDS" \
    https://api.cloudflare.com/client/v4/user || true)"

  case "$code" in
    2*|3*|4*)
      printf 'OK curl Cloudflare API reachable (HTTP %s)\n' "$code"
      ;;
    *)
      printf 'FAIL curl Cloudflare API unreachable (HTTP %s)\n' "${code:-000}"
      return 1
      ;;
  esac
}

check_node_fetch() {
  if ! command -v node >/dev/null 2>&1; then
    printf 'SKIP node not found\n'
    return 0
  fi

  local outfile="$tmpdir/node-fetch.log"
  if run_with_timeout "node fetch" "$outfile" "$NODE_CMD" -e '
    fetch("https://api.cloudflare.com/client/v4/user")
      .then((response) => {
        console.log(`HTTP ${response.status}`);
      })
      .catch((error) => {
        console.error(error && error.stack ? error.stack : error);
        process.exit(1);
      });
  '; then
    printf 'OK node fetch Cloudflare API reachable\n'
  else
    printf 'FAIL node fetch Cloudflare API failed\n'
    sed -n '1,12p' "$outfile"
    return 1
  fi
}

check_deno_fetch() {
  if ! command -v deno >/dev/null 2>&1; then
    printf 'SKIP deno not found\n'
    return 0
  fi

  local outfile="$tmpdir/deno-fetch.log"
  if run_with_timeout "deno fetch" "$outfile" deno eval '
    const response = await fetch("https://api.cloudflare.com/client/v4/user");
    console.log(`HTTP ${response.status}`);
  '; then
    printf 'OK deno fetch Cloudflare API reachable\n'
  else
    printf 'FAIL deno fetch Cloudflare API failed\n'
    sed -n '1,12p' "$outfile"
    return 1
  fi
}

check_wrangler() {
  local outfile="$tmpdir/wrangler.log"
  if run_with_timeout "wrangler whoami" "$outfile" env -u CLOUDFLARE_API_TOKEN WRANGLER_SEND_METRICS=false \
    bash -lc "$WRANGLER_CMD whoami"; then
    printf 'OK wrangler whoami succeeded\n'
  else
    printf 'FAIL wrangler whoami failed\n'
    sed -n '1,20p' "$outfile"
    return 1
  fi
}

main() {
  local failed=0

  check_curl || failed=1
  check_node_fetch || failed=1
  check_deno_fetch || failed=1
  check_wrangler || failed=1

  if [ "$failed" -ne 0 ]; then
    cat <<'EOF'

NO-GO: Cloudflare API may be reachable by curl, but Node/Deno/Wrangler networking is not healthy.
Do not run Wrangler deploys until this check is green.
EOF
    return 1
  fi
}

main "$@"
