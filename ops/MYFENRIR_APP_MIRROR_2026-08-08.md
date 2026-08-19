# myfenrir.app → 1:1 con myfenrir.com — Estado y plan

Fecha: 2026-08-08 · Cuenta Cloudflare: `e2a7eccb24c4836847fd14d08c499bd0`
Verificado vía dashboard Cloudflare (sesión de Francisco). **Sin secretos, sin API keys.**

## TL;DR
**No se pudo activar nada todavía**, y no es por falta de permiso sino por un
bloqueador de raíz: **`myfenrir.app` NO existe como zona en Cloudflare y NO está
registrado en esta cuenta.** Todo lo demás (espejo Pages o redirect 301) depende
de que primero exista la zona `myfenrir.app` en la cuenta. Reporto abajo qué falta
exactamente para que Francisco lo complete.

## Estado actual encontrado (verificado, no supuesto)

### Cómo sirve HOY myfenrir.com
- Lo sirve el **Cloudflare Pages project `fenrir-bridge`** (origin `fenrir-bridge.pages.dev`;
  `pages_build_output_dir: dist` en `apps/fenrir-bridge/wrangler.jsonc`).
- **Custom domains del project `fenrir-bridge`** (Workers & Pages → fenrir-bridge → Custom domains):
  - `myfenrir.com` — Active (SSL enabled)
  - `www.myfenrir.com` — Active (SSL enabled)
  - `auth.myfenrir.com` — Active (SSL enabled)
  - `communities.myfenrir.com` — **Verifying** (falta completar DNS setup)
- **Workers ruteados por zona sobre `myfenrir.com`** (overlay de rutas puntuales; el resto pega a Pages):
  - `fenrir-direct-oauth-guard` → `/`, `/api/auth/me`, `/api/auth/complete`, `auth.*/api/auth/login|callback`
  - `fenrir-gate-router` → `/gate/*`, `/api/telegram/webhook|gate-approve|gate-status`
  - `fenrir-mcp-beta` → `/api/mcp*`, `/api/routes/audit*`
  - `fenrir-allowlist-check` → `/api/internal/community/allowlist-check`
  - `fenrir-auth-proxy` → `auth.myfenrir.com/*`
- Vars relevantes (en `wrangler.jsonc`): `PUBLIC_SITE_URL=https://myfenrir.com`,
  `ALLOWED_REDIRECT_URIS=https://myfenrir.com,https://www.myfenrir.com,http://localhost:5173`.

### Estado de myfenrir.app
- **NO** aparece en las 16 zonas de la cuenta (sí está `myfenrir.com`, Active).
- **NO** aparece en Registrations (6 dominios en Cloudflare Registrar: brumaconcierge.com,
  brumahost.com, brumavoice.com, friskyghost.com, myfenrir.com, stixmagic.com) — ninguno `.app`.
- Por tanto: **sin zona, sin DNS en Cloudflare, sin asociación a ningún Pages/Worker.**
- Registro externo: no verificable desde este entorno (egress con allowlist; sin DNS/WHOIS).
  Francisco debe confirmar si `myfenrir.app` está registrado (y en qué registrador) o si hay que comprarlo.

### Prueba concreta del bloqueador
En Workers & Pages → `fenrir-bridge` → Custom domains → "Set up a custom domain" →
`myfenrir.app`, el asistente llega al paso 2 y propone el registro
`CNAME @ → fenrir-bridge.pages.dev` con botón "Activate domain". **No pulsé Activate.**
Si se pulsa sin que exista la zona/DNS, sólo crea una entrada **"Verifying"** que nunca
verifica hasta que `myfenrir.app` apunte de verdad a Cloudflare (igual que
`communities.myfenrir.com` hoy).

## Por qué no pude ejecutarlo por wrangler / MCP
- `wrangler` (4.120) está instalado pero **no autenticado** en este entorno y `wrangler login`
  es interactivo (OAuth por navegador) → no ejecutable en sesión no interactiva.
- El MCP de Cloudflare conectado sólo expone Workers/D1/KV/R2/docs → **no** hay herramientas de
  **Pages custom domains** ni de **DNS/zonas**.
- Egress del sandbox con allowlist → `curl`/`dig` a myfenrir.com/.app y DoH quedan bloqueados
  (`X-Proxy-Error: blocked-by-allowlist`).
- Camino real disponible = **dashboard** (que sí verifiqué), pero el prerequisito (zona) no existe.

## Espejo vs redirect — recomendación
"1:1 config" es ambiguo. Análisis:

- **Espejo (mismo origin sirviendo la app):** añadir `myfenrir.app` + `www.myfenrir.app` como
  custom domains del MISMO project `fenrir-bridge`. Sirve el MISMO build.
  **Pero** un 1:1 *funcional completo* NO es sólo Pages: el SSO y los workers están acoplados a `.com`
  (`ALLOWED_REDIRECT_URIS`, `PUBLIC_SITE_URL`, redirect URIs en Google/Microsoft/Apple, y las rutas
  de los 5 workers apuntan a `myfenrir.com`). En `.app`, login/gate/mcp romperían salvo que además
  se repliquen las rutas de esos workers para la zona `myfenrir.app`, se amplíe `ALLOWED_REDIRECT_URIS`
  y se añadan los callbacks `.app` en cada proveedor OAuth. Es trabajo extra no trivial.
- **Redirect 301 (recomendado como ACTIVO):** `myfenrir.app` y `www.myfenrir.app` → **301 al canónico
  `https://www.myfenrir.com`**. Evita contenido duplicado (SEO) y todo el problema de acoplamiento
  OAuth/workers. Coherente con la otra tarea de redirects (Force HTTPS + apex→www canónico en `.com`):
  el canónico único queda `www.myfenrir.com`; `.app` sólo redirige, **sin duplicar** el fix de HTTPS/apex
  que ya vive en la zona `.com`.

**Recomendación:** dejar **301 de `.app` → `https://www.myfenrir.com` como activo**, salvo que Francisco
quiera `.app` como marca independiente/espejo real (entonces se hace el espejo + la replicación
OAuth/workers descrita arriba).

⚠️ Ojo: **el redirect también requiere la zona `myfenrir.app` en Cloudflare** (las Redirect Rules /
Single Redirects son por zona; Bulk Redirects necesitan que el hostname resuelva a Cloudflare). Es
decir, zona primero en ambos casos.

## Pendientes de Francisco (pasos exactos)
1. **Confirmar/registrar `myfenrir.app`.** Si no está registrado: comprarlo (Cloudflare Registrar →
   Domains → Buy domain, o cualquier registrador). `.app` es TLD HSTS-preload (siempre HTTPS) — sin impacto extra.
2. **Añadir la zona a Cloudflare:** dash → Add domain → `myfenrir.app` (plan Free) → Cloudflare da 2
   nameservers.
3. **Apuntar los nameservers** de `myfenrir.app` a los que da Cloudflare (en el registrador). Esperar a
   estado **Active** de la zona.
4. Avísame (o dime "dale") y yo dejo lo elegido:
   - **Si REDIRECT (recomendado):** creo Single Redirect en la zona `myfenrir.app`:
     `http(s)://(www.)myfenrir.app/*` → `https://www.myfenrir.com/$1` (301, preserve path/query) +
     Always Use HTTPS. Verifico con curl.
   - **Si ESPEJO:** en `fenrir-bridge` → Custom domains → "Activate domain" para `myfenrir.app` y
     `www.myfenrir.app` (CNAME @ / www → `fenrir-bridge.pages.dev`) + (opcional) replicar rutas de los 5
     workers y ampliar `ALLOWED_REDIRECT_URIS`/OAuth redirect URIs para `.app`.

## Verificación en vivo
No realizable desde este entorno (egress allowlisted): `curl -sI https://myfenrir.app` y `https://www.myfenrir.app`
devuelven `403 blocked-by-allowlist` del proxy del sandbox (no del sitio). Igual para `myfenrir.com` y
`fenrir-bridge.pages.dev` — o sea, es el sandbox, no el destino. La verificación con `curl` se hará en
cuanto exista la zona (yo la corro, o Francisco desde su máquina):
`curl -sI https://myfenrir.app` y `https://www.myfenrir.app` → esperar 301 al canónico (o 200 sirviendo la app si espejo).
