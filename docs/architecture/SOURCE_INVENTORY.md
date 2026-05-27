# Source Inventory

This is the expected Fenrir import set for the organized GitLab repo.

## apps/fenrir-bridge

Source:

```text
/Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-bridge
```

Expected root files:

```text
AGENTS.md
Dockerfile
README.md
index.html
package.json
package-lock.json
tailwind.config.ts
tsconfig.json
vite.config.ts
wrangler.jsonc
wrangler.fenrir-auth-proxy.toml
wrangler.fenrir-direct-oauth-guard.toml
wrangler.fenrir-gate-router.toml
wrangler.fenrir-mcp-beta.toml
wrangler.fenrir-stars.toml
```

Expected folders:

```text
docs/
functions/
public/
scripts/
src/
supabase/
workers/
```

Important runtime surfaces:

```text
functions/api/auth/supabase-session.ts
functions/api/auth/callback/[provider].ts
functions/api/auth/me.ts
functions/api/readiness.ts
functions/api/telegram/stars.ts
functions/api/telegram/webhook.ts
functions/_lib/readiness.ts
functions/_lib/telegram-stars.ts
functions/_lib/community-auth.ts
functions/_lib/community-gate.ts
workers/fenrir-gate-router.js
workers/fenrir-stars-payments.js
workers/fenrir-mcp-beta.js
scripts/check-cloudflare-tooling.sh
scripts/guard-wrangler-deploy.sh
scripts/run-with-node-lts.sh
scripts/verify-myfenrir.sh
scripts/verify-readiness.mjs
```

Do not import:

```text
.git/
.env.local
node_modules/
dist/
.wrangler/
.pytest_cache/
artifacts/
```

## apps/fenrir-cinema

Source:

```text
/Users/friskypup/Documents/Playground/frisky-spark-lab/apps/fenrir-cinema
```

Expected files/folders:

```text
README.md
package.json
package-lock.json
remotion.config.ts
tsconfig.json
src/
public/
preview/
```

Recovered in this GitLab seed:

```text
package.json
remotion.config.ts
tsconfig.json
src/DeployTemporalFlow.tsx
src/Root.tsx
src/index.css
src/index.ts
preview/fenrir-deploy-temporal-flow.svg
public/fenrir-cut-wordmark-800.png
public/fenrir-splash-icon-512.png
public/fenrir-splash-icon.svg
RECOVERY_NOTES.md
```

Still source-blocked in the original FileProvider folder:

```text
src/Composition.tsx
src/AdminGuidebook.tsx
src/NeonNexusMJ.tsx
README.md
package-lock.json
```

Do not import:

```text
node_modules/
build/
out/
```

## legacy/fenrir-portal

Source:

```text
/Users/friskypup/Documents/Playground/experiments/fenrir-portal
```

Expected files:

```text
index.html
vercel.json
wrangler.jsonc
wrangler.toml
_headers
```

Do not treat this as active production unless it is explicitly revived.
