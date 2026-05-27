# GitLab Handoff

This repository is the organized Fenrir seed intended for GitLab.

## Local Repo

```text
/Users/friskypup/Documents/Playground/fenrir-unified-gitlab
```

## Current Status

- `apps/fenrir-bridge` is present with frontend, Pages Functions, docs, scripts, and all expected standalone Workers.
- `apps/fenrir-cinema` is present as a recovered Remotion seed with recovery notes.
- `legacy/fenrir-portal` is documented but not imported because the original files are still FileProvider placeholders.
- Generated folders, dependency folders, and local secret files are excluded.
- `bash ops/verify-layout.sh` must pass before push.
- `bash ops/audit-gitlab-readiness.sh` must pass after the GitLab remote is configured and pushed.

## Push Path

Create an empty GitLab project, then run:

```bash
cd /Users/friskypup/Documents/Playground/fenrir-unified-gitlab
bash ops/configure-gitlab-remote.sh <gitlab-remote-url>
git push -u origin main
bash ops/audit-gitlab-readiness.sh
```

Expected remote URL shapes:

```text
git@gitlab.com:<namespace>/fenrir-unified.git
https://gitlab.com/<namespace>/fenrir-unified.git
```

## Offline Import Bundle

When a direct push is not available, create a portable Git bundle:

```bash
bash ops/create-gitlab-bundle.sh
```

The script writes the bundle under `/private/tmp`. On another machine with GitLab access:

```bash
git clone /path/to/fenrir-unified-gitlab.bundle fenrir-unified
cd fenrir-unified
git remote add origin <gitlab-remote-url>
git push -u origin main
bash ops/audit-gitlab-readiness.sh
```

## Remaining Source Caveats

Fenrir Cinema was reconstructed from session evidence because the original sidecar source files are still cloud placeholders. Keep `apps/fenrir-cinema/RECOVERY_NOTES.md` with the repo until those originals are hydrated and intentionally re-imported.

Do not deploy Cloudflare through Wrangler while Wrangler fetch is failing. Use the documented API/curl path or wait until Wrangler health is restored.
