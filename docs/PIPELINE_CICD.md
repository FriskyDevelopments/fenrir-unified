# MyFenrir CI/CD Pipeline (Cloudflare via GitLab CI)

Auto-deploy for the two MyFenrir surfaces across **Quality** and **prod**, driven
by GitLab CI (`.gitlab-ci.yml`). Push to the right branch → the right surface
deploys. No manual wrangler steps for Quality; prod stays manual until approved.

- **Git host:** GitLab (`origin` = gitlab.com/frisky-developments-llc/fenrir-unified). No GitHub.
- **Cloudflare account:** `e2a7eccb24c4836847fd14d08c499bd0` (workers.dev `hrgrrtks2p`). **Never** `f2ff2cc0…`. Every deploy job pins `CLOUDFLARE_ACCOUNT_ID`.
- **CI auth:** the existing `CLOUDFLARE_API_TOKEN` GitLab CI/CD variable (Masked+Protected). No token in git, ever.
- **Operator manual deploys:** wrangler **OAuth** on the Mac (token stripped) — see "Manual / local deploys".

## Branch → environment map

| Branch     | Environment | Trigger              | Surfaces |
|------------|-------------|----------------------|----------|
| `quality`  | Quality     | **auto** on push     | fenrir-bridge (Pages preview `--branch quality`) + community-bridge (`community-bridge-quality`) |
| `main`     | prod        | **manual** (button)  | fenrir-bridge (Pages `--branch main`) + community-bridge (`community-bridge`) |

## Surfaces

| App | Cloudflare product | Prod | Quality | Build → deploy |
|-----|--------------------|------|---------|----------------|
| `apps/fenrir-bridge` | **Pages** project `fenrir-bridge` | www/auth/myfenrir.com | `quality.fenrir-bridge.pages.dev` (preview branch) | `vite build` → `wrangler pages deploy dist --project-name fenrir-bridge --branch <main\|quality>` |
| `apps/community-bridge` | **Worker** | `community-bridge` @ communities.myfenrir.com | `community-bridge-quality` @ quality.communities.myfenrir.com | `vite build` (Nitro) → `wrangler deploy --config .output/server/wrangler.json --name <worker>` |

Quality for `fenrir-bridge` is a Pages **preview** deployment — the production
alias only moves on `--branch main`, so Quality can never overwrite prod.
Quality for `community-bridge` is a **separate worker** (`community-bridge-quality`)
built with `VITE_SITE_URL=https://quality.communities.myfenrir.com` and the DEV
Telegram bot `@MyfenrirprotocolDEVbot`, via `apps/community-bridge/scripts/deploy-quality.sh`.

## The token-scope decision (do this to turn Quality on)

`CLOUDFLARE_API_TOKEN` is **Protected**, so GitLab only exposes it on **protected
branches**. The `quality` branch is not protected by default, so:

> **Chosen resolution:** mark **`quality`** as a **Protected branch**
> (Settings → Repository → Protected branches; set Allowed-to-push / merge to
> your role). This exposes the *existing* Protected token to Quality jobs.
> **Nothing about prod / `main` is changed or un-protected.**

Fail-safe: every deploy job's rule ends with `&& $CLOUDFLARE_API_TOKEN`. If
`quality` isn't protected yet, the token is empty there and the jobs are simply
**skipped** — no error, no half-deploy. (Alternative, if you dislike protecting
`quality`: add a second **non-protected** copy of the token — less secure, exposed
to all branches/MRs — not recommended.)

## Required GitLab CI/CD variables (Settings → CI/CD → Variables)

| Variable | Masked | Protected | Used by | Notes |
|----------|--------|-----------|---------|-------|
| `CLOUDFLARE_API_TOKEN` | yes | yes | all deploy jobs | **Already configured.** Scope: account `e2a7eccb` → Workers Scripts:Edit + Pages:Edit (+D1:Edit if D1 migrations run). |
| `SESSION_SECRET` | yes | yes | `fenrir-bridge:deploy` (prod) | Existing. Only pushed on prod. |
| `PROD_TELEGRAM_BOT_USERNAME` | yes | yes | `community-bridge:deploy` (prod) | **You must add this** before the prod community-bridge job can run. The prod bot handle was not derivable from the repo, so it is not hardcoded. The job refuses to build prod with the dev-bot fallback. |

Do **not** create a project-wide `VITE_TELEGRAM_BOT_USERNAME` variable — the
Quality job would inherit a prod bot. The Quality job also `unset`s it defensively.

## Enabling Quality auto-deploy (one-time)

1. Merge `ci/quality-pipeline` → `main` (via MR) so `.gitlab-ci.yml` + `deploy-quality.sh` land on the default branch.
2. Create the `quality` branch: `git branch quality main && git push -u origin quality`.
3. **Protect** `quality` (Settings → Repository → Protected branches).
4. From then on, any push to `quality` auto-builds + deploys both Quality surfaces and verifies them.

## Prod (configured, OFF until approved)

`fenrir-bridge:deploy` and `community-bridge:deploy` are gated to `main` +
`when: manual`. They never run on push. Ship prod by opening the `main`
pipeline and clicking **Run** on the job. Prod stays dormant until you do.

## Rollback

- **fenrir-bridge (Pages):** `wrangler pages deployment list --project-name fenrir-bridge` → find the last good deploy → in the Pages dashboard "Rollback to this deployment", or re-deploy a known-good commit with `--branch main`. Quality preview rollbacks are harmless (preview only).
- **community-bridge (Worker):** `wrangler deployments list --name community-bridge` → `wrangler rollback [<version-id>] --name community-bridge`. Same with `--name community-bridge-quality` for Quality.
- **Pipeline itself:** revert the offending commit on `main`; the deploy is manual so nothing re-ships until you click Run.
- All rollbacks: prefix with `CLOUDFLARE_ACCOUNT_ID=e2a7eccb24c4836847fd14d08c499bd0` and (locally) `env -u CLOUDFLARE_API_TOKEN` to use OAuth.

## Manual / local deploys (operator, wrangler OAuth)

Run on Francisco's Mac. Token is stripped so wrangler uses the browser OAuth
session (account `e2a7eccb`). This is the exact path used for the Quality
evidence below.

```bash
# fenrir-bridge Quality preview
cd ~/fenrir-unified/apps/fenrir-bridge
npm ci && npm run build
env -u CLOUDFLARE_API_TOKEN CLOUDFLARE_ACCOUNT_ID=e2a7eccb24c4836847fd14d08c499bd0 \
  npx wrangler pages deploy dist --project-name fenrir-bridge --branch quality --commit-dirty=true

# community-bridge Quality worker (identical to what CI runs)
cd ~/fenrir-unified/apps/community-bridge
npm ci || npm install
env -u CLOUDFLARE_API_TOKEN bash scripts/deploy-quality.sh
```

Never run prod deploys without explicit approval.

## Data / auth backends (context, not touched by this pipeline)

- Community data → **Neon**. MyFenrir auth → **Supabase** (canonical project `yqevglppbhuoxxfsfnih`).
- This pipeline never touches DNS, billing, or provider secrets. It only builds and deploys the two app surfaces.

## Evidence

_(Filled from the real Quality deploy — see "Quality deploy evidence" at the bottom, appended after the run.)_
