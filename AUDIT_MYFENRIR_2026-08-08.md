# Auditoría MyFenrir (myfenrir.com) — 8 ago 2026

Auditoría end-to-end del sitio LIVE + repo `~/fenrir-unified` (app `apps/fenrir-bridge`, Cloudflare Pages).
Todo verificado contra el sitio real y el código. Sin secretos en este reporte.

---

## Resumen ejecutivo

- **El sitio LIVE está sano en lo esencial.** Home, `/login`→`/main` (dashboard) y `/wiki` cargan con **HTTP 200**, **sin errores de consola**, favicon/manifest 200, y las APIs (`/api/auth/me`, `/api/app-state`, `/api/readiness`) responden 200 con datos reales.
- **SSO OPERATIVO en los 3 proveedores.** `GET /api/auth/login/{google,microsoft,apple}` devuelve **302 (redirect al proveedor)** en producción → los tres tienen credenciales configuradas y funcionan. **Apple ya NO está desactivado** (la sesión del navegador está activa vía Apple — email private-relay). El secreto de Apple está OK.
- **Higiene limpia.** Ningún secreto filtrado en repo ni en el bundle `dist/`. Headers de seguridad y CSP fuertes.
- **Arreglado (rama `claude/audit-seo-csp-fixes`, en disco):** faltaban meta SEO/OG/Twitter en la landing + la CSP principal no permitía Google Fonts. Ambos corregidos.
- **No se pudo construir/desplegar desde este entorno** (sin red a Cloudflare, `node_modules` compilado para macOS, OAuth de wrangler es interactivo). Ver *Handoff*.

**P0 confirmados: 0.** No hay nada roto crítico.

---

## Hallazgos priorizados

### P1 — Impacto real (ambos ARREGLADOS)

1. **SEO / social meta ausentes en la landing.** `index.html` no tenía `description`, ni Open Graph, ni Twitter Card, ni `canonical`. Resultado: previews de enlace vacíos (Telegram/X/Slack) y SEO pobre.
   Evidencia: `document.querySelector('meta[name=description]')` → `null`; sin `og:*` ni `twitter:*`.
   **Fix aplicado:** añadidos `description`, `canonical`, `og:type/site_name/title/description/url/image/image:alt`, `twitter:card/title/description/image` (og:image → `/fenrir-cut-wordmark-1600.png`, ya existe).

2. **CSP principal no permitía las fuentes que el CSS importa.** `src/styles/global.css` y `src/components/CinematicLanding.tsx` hacen `@import` de Google Fonts (Unbounded/Outfit/JetBrains Mono/Inter/Orbitron), pero la política `/*` en `public/_headers` sólo tenía `style-src 'self' 'unsafe-inline'` sin `font-src` → tipografía frágil. En la auditoría, `fonts.googleapis.com` devolvió **HTTP 503**.
   **Fix aplicado:** la CSP `/*` ahora permite `https://fonts.googleapis.com` (style-src) y `https://fonts.gstatic.com` (font-src), igual que ya hacía la política `/activation`.

### P2 — Pulido / decisiones de marca (PROPUESTOS, no aplicados)

3. **`theme-color` = `#ff1744` (rojo)** en `index.html` y `site.webmanifest`, choca con el fondo oscuro `#050508`. Cambiarlo a un tono de marca/oscuro mejora el chrome del navegador móvil. No lo apliqué para no imponer color. *(Reversible en 1 línea.)*

4. **La marca "neon-lime `#b7ff2a`" NO existe en el código.** `src/theme/brandThemes.ts` usa **oro/tinta** para `fenrir` y comenta explícitamente que el set neón ("LORE contamination") **se removió a propósito**. Hay una tensión de dirección de marca: lo que pediste (neon-lime) contradice la decisión de diseño vigente. **Necesita tu OK** antes de aplicar cualquier color — no lo forcé.

5. **Inconsistencia visual entre superficies:** home (wordmark cian/teal), dashboard (oro), wiki (verde + serif). Parece intencional, pero unificar el acento daría más cohesión. *(Observación.)*

6. **Dependencia de Google Fonts** (503 en IP de datacenter). Para robustez total: **self-host** las fuentes con `@font-face`. *(Mejora, más invasiva.)*

7. **Menor:** backups `.env.local.bak-*` en el árbol de trabajo (gitignored, no filtrados). Limpieza recomendada.

---

## Higiene y seguridad (estado: BUENO)

- Todos los `.env / .env.local / .dev.vars / *.bak` están **gitignored** (verificado con `git check-ignore`). Nada de secretos trackeados salvo `.env.example` (ok).
- **Sin valores de secretos en `dist/`.** El único match del escáner (`dist/wiki/index.html`) es **texto de documentación** que lista *nombres* de variables (`RLS: service_role write only`, lista con `SUPABASE_SERVICE_KEY`) — no valores.
- **Headers de seguridad fuertes:** HSTS con `preload`, `X-Content-Type-Options: nosniff`, `X-Frame-Options: DENY`, `Cross-Origin-Opener-Policy`, `Referrer-Policy`, `Permissions-Policy` restrictivo, y CSP con `default-src 'self'`, `object-src 'none'`, `frame-ancestors 'none'`. Muy bien.
- SSO: OAuth directo con **PKCE (S256)**, `state`+`nonce`, y cada proveedor gated por credenciales (`isDirectOAuthAvailable`) → si faltara un secreto, devuelve `410 direct_oauth_disabled` en vez de romper.

---

## Contenido (estado: REAL, no fake)

- Los datos del dashboard son reales (usuario/plan/subscription vienen del backend).
- Los `example.com` encontrados son **placeholders legítimos de inputs** (URL de pago, mascota/fondo de comunidad), no contenido inventado.
- Sin `lorem ipsum`, `TODO/FIXME`, ni "coming soon" en la UI de `src`.

---

## Lo que NO pude verificar / hacer desde aquí (honesto)

- **Build + deploy preview: BLOQUEADO en este entorno.** `api.cloudflare.com` → **403 del proxy** (sin red a Cloudflare); `node_modules` trae binarios de **macOS** (`workerd-darwin-arm64`, `rollup-darwin-arm64`) que no corren en el sandbox Linux; y el login OAuth de wrangler es **interactivo**. Hay que correrlo en tu máquina (ver Handoff).
- **Commit: pendiente.** `.git/index.lock` está retenido por **otro proceso** (probablemente la tarea de favicon en curso) — no lo forcé para no corromper esa operación. Mis cambios **están guardados en disco** en la rama `claude/audit-seo-csp-fixes`; sólo falta el commit.
- **Móvil real 360/390:** el Chrome de escritorio no permitió emular (viewport clamped a ~1483px, el render se congeló una vez). Evalué la responsividad por CSS: **10 media queries**, breakpoints 460/520/640/680/920/1050px + `prefers-reduced-motion` → cobertura razonable. Recomiendo una prueba en dispositivo real.

---

## Handoff — construir y desplegar PREVIEW (en tu máquina, wrangler ya OAuth-autenticado)

```bash
cd ~/fenrir-unified/apps/fenrir-bridge

# 1) commitea mis 2 fixes (ya en disco en la rama claude/audit-seo-csp-fixes)
git add index.html public/_headers
git commit -m "fix(seo+csp): meta OG/Twitter + Google Fonts en CSP"

# 2) build limpio (binarios nativos correctos)
npm ci
npm run build

# 3) deploy a PREVIEW (branch != main => NO pisa producción)
env -u CLOUDFLARE_API_TOKEN deno run -A npm:wrangler@4.90.0 \
  pages deploy dist --project-name fenrir-bridge --branch audit-preview
```

Wrangler devolverá una URL `*.fenrir-bridge.pages.dev` de preview. Verifícala antes de promover nada a `main`.

## Verificación post-deploy sugerida
- Que `/` sirva las nuevas meta (ver-fuente o inspector) y que un unfurl (Telegram/X) muestre título+imagen.
- Que en Network las fuentes de `fonts.gstatic.com` carguen 200 sin violación de CSP en consola.
- Prueba de SSO Apple/Google/Microsoft en el preview (redirect al proveedor).

---

## Pendiente de tu OK (cambios de marca / riesgo)
- ¿Aplicar neon-lime `#b7ff2a`? Contradice la marca oro/tinta vigente en `brandThemes.ts`. Dime la dirección y lo implemento consistentemente.
- ¿Cambiar `theme-color` rojo → oscuro de marca?
- ¿Self-host de fuentes para eliminar la dependencia de Google (503)?
