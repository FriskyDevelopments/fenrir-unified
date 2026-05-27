#!/usr/bin/env bash
set -euo pipefail

if [ -x /opt/homebrew/opt/node@22/bin/node ]; then
  export PATH="/opt/homebrew/opt/node@22/bin:$PATH"
elif [ -x /usr/local/opt/node@22/bin/node ]; then
  export PATH="/usr/local/opt/node@22/bin:$PATH"
fi

exec "$@"
