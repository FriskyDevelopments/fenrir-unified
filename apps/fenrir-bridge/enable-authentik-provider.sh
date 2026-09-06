#!/usr/bin/env bash
# Kept as a compatibility notice for old runbooks. Authentik is retired.
set -euo pipefail

cat >&2 <<'NOTICE'
Authentik is retired and cannot be enabled by this helper.
App login uses the Fenrir Better Auth Worker at /auth/*, with the flagged
/api/frisky-auth integration as an additional identity source.
See AGENTS.md and docs/FRISKY_AUTH_MIGRATION.md for the current setup.
No files, credentials, or provider settings were changed.
NOTICE
exit 1
