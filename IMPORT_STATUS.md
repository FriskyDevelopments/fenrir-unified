# Import Status

Current state: scaffold ready, source materialization blocked.

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

## Current Blocker

The source folders exist, but required files are not locally readable. They are cloud/FileProvider placeholders.

Latest readiness result:

```text
BLOCKED fenrir-bridge    /Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-bridge/package.json is not locally readable yet
BLOCKED fenrir-cinema    /Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-cinema/package.json is not locally readable yet
BLOCKED fenrir-portal    /Users/friskypup/Documents/Playground/experiments/fenrir-portal/index.html is not locally readable yet
```

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
