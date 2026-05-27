# Fenrir Unified

GitLab-ready consolidation target for the Fenrir / MyFenrir solution family.

This repo is meant to join the working Fenrir surfaces into one organized tree:

- `apps/fenrir-bridge`: primary MyFenrir web app, Cloudflare Pages Functions, auth, readiness, Telegram, billing, community gate, and public UI.
- `apps/fenrir-cinema`: Remotion/admin-guide/video sidecar for launch proof, walkthroughs, and operator material.
- `legacy/fenrir-portal`: older/static portal experiment kept as reference only.
- `docs/architecture`: consolidation notes and product/runtime map.
- `ops`: import, verification, and deploy helper scripts.

## Current Source Roots

```text
/Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-bridge
/Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-cinema
/Users/friskypup/Documents/Playground/experiments/fenrir-portal
```

## Important Separation Rules

Fenrir is not the Gemini bot repo. Gemini can be the optional mind/concierge layer, but Fenrir owns auth, access, payment state, and deployment truth.

The current launch lane is Telegram Stars plus D1/Worker entitlement state. Stripe can stay as an optional standby integration, but it should not block the non-Stripe launch path.

## Materialize The Code

Run this after FileProvider/iCloud/Google Drive has hydrated the source folders:

```bash
bash ops/materialize-from-sources.sh
```

That script copies source-controlled project files and skips secrets, generated output, local caches, and dependency folders.

## Verify

For the GitLab seed layout:

```bash
bash ops/verify-layout.sh
```

For the full GitLab handoff gate:

```bash
bash ops/audit-gitlab-readiness.sh
```

For the primary app:

```bash
cd apps/fenrir-bridge
npm install
npm run wrangler:check
npm run verify:prod
npm run build
```

Do not run a Cloudflare deploy until `npm run wrangler:check` is green.

## Push To GitLab

Create an empty GitLab project, then connect this local repo:

```bash
bash ops/configure-gitlab-remote.sh <gitlab-remote-url>
git push -u origin main
bash ops/audit-gitlab-readiness.sh
```

If direct network push is unavailable, create an import bundle:

```bash
bash ops/create-gitlab-bundle.sh
```

If `glab` is authenticated and network access is available, create the private GitLab project and push in one step:

```bash
bash ops/create-gitlab-project-and-push.sh <namespace>/fenrir-unified
```
