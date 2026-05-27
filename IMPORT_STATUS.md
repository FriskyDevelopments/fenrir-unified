# Import Status

Current state: Fenrir Bridge imported from readable local fallback; Fenrir Cinema and legacy portal still blocked by source hydration.

## Organized Repo Created

```text
/Users/friskypup/Documents/Playground/fenrir-unified-gitlab
```

The repo is initialized on `main` and has:

- GitLab CI skeleton.
- Safe `.gitignore`.
- Consolidation map.
- Source inventory.
- Materialization script.
- Layout verifier.
- Source readiness checker.
- Imported `apps/fenrir-bridge` source from `/private/tmp/fenrir-current-build`, overlaid with local deploy-safety fixes where available.

## Current Blocker

The primary source folders exist, but some required files are not locally readable. They are cloud/FileProvider placeholders.

Latest readiness result:

```text
BLOCKED fenrir-cinema    /Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-cinema/package.json is not locally readable yet
BLOCKED fenrir-portal    /Users/friskypup/Documents/Playground/experiments/fenrir-portal/index.html is not locally readable yet
READY   bridge-fallback  /private/tmp/fenrir-current-build
```

Fenrir Bridge is now present in the organized repo:

```text
apps/fenrir-bridge/package.json
apps/fenrir-bridge/src/
apps/fenrir-bridge/functions/
apps/fenrir-bridge/workers/
apps/fenrir-bridge/docs/
```

Worker note: `workers/fenrir-direct-oauth-guard.js` was copied from the primary source because it was readable. Other standalone worker files were still FileProvider-blocked in the primary source at the time of this import.

Strict verifier currently still expects these missing files before the import can be considered complete:

```text
apps/fenrir-bridge/workers/fenrir-gate-router.js
apps/fenrir-bridge/workers/fenrir-mcp-beta.js
apps/fenrir-bridge/workers/fenrir-stars-payments.js
apps/fenrir-cinema/package.json
apps/fenrir-cinema/src
```

## Recovery Attempts

On 2026-05-27, local artifact search found a readable Fenrir Bridge fallback at `/private/tmp/fenrir-current-build`, which was imported.

The remaining standalone worker and Fenrir Cinema source files were found only in their original cloud-backed source folders:

```text
/Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-bridge/workers/
/Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-cinema/
```

Those files are still FileProvider-blocked from this sandbox. `brctl download` could not be used here because the process is sandboxed. A broader local search did not reveal a readable duplicate of the remaining missing source files before it was stopped for safety.

## Next Command

Once the source folders are hydrated locally:

```bash
cd /Users/friskypup/Documents/Playground/fenrir-unified-gitlab
bash ops/check-source-readiness.sh
bash ops/materialize-from-sources.sh
bash ops/verify-layout.sh
```

## Completion Criteria

This import is complete only when:

- `apps/fenrir-bridge/package.json` exists.
- `apps/fenrir-bridge/src`, `functions`, `workers`, and `docs` exist.
- `apps/fenrir-cinema/package.json` and `src` exist.
- generated folders and secrets are absent.
- `bash ops/verify-layout.sh` exits green.
- GitLab remote is configured and pushed, if remote creation/push is requested.
