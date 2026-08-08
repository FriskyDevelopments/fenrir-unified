# Community Bridge standalone en communities.myfenrir.com (Neon-based)

**Fecha:** 2026-08-08 · **Estado:** aprobado por el dueño (opción A + subdominio elegido)

## Objetivo

Sacar la experiencia de Community Bridge (el remix 99 de "FENRIR Access Control",
que ya vive como `apps/community-bridge`) del ámbito del dashboard de
`myfenrir.com`: deploy propio, dominio propio (`communities.myfenrir.com`) y
backend 100% Neon (el data plane del community gate), eliminando el broker
Lovable Cloud/Supabase con el que vino de Lovable.

## Contexto

- `apps/community-bridge` == remix 99 (diff verificado: solo difieren los 4
  archivos de la limpieza HostCasa del 08-ago). No hay que importar nada del zip.
- El contrato Neon ya existe y está vivo en prod dentro de fenrir-bridge:
  `functions/api/community-auth/*` (magic link + OAuth Google/Microsoft/Apple
  por comunidad, sesiones HttpOnly, brands desde `fenrir_gate_communities`).
- El login actual del remix va por `src/integrations/supabase` +
  `src/integrations/lovable` (proyecto Lovable `jgktxeabubmkxkhlftkg`) — es el
  P1 del audit del 08-ago y se elimina.
- Lección del 08-ago: los deploys de Pages son atómicos. Este diseño usa un
  proyecto Pages NUEVO — radio de daño cero sobre `myfenrir.com`.

## Arquitectura

```
communities.myfenrir.com          (CNAME → nuevo Pages project "community-bridge")
 ├─ SPA estático (dist/)          remix en modo SPA: TanStack Router client-only,
 │                                sin TanStack Start SSR (el corte que describe
 │                                su propio .lovable/plan.md)
 └─ functions/api/community-auth/* copiadas de fenrir-bridge (contrato Neon
                                   idéntico; mismo _lib). Cookies de sesión
                                   HttpOnly en el propio origen.
```

- **Fase 1 (este proyecto): copiar** las functions `community-auth` + `_lib`
  necesarios (`community-auth.ts`, `community-oauth.ts`, `oauth.ts`,
  `responses.ts`) de fenrir-bridge a `apps/community-bridge/functions/`.
  La deduplicación en un paquete compartido queda como mejora futura — no
  bloquea y evita tocar fenrir-bridge hoy.
- **Rutas del SPA**: `/g/:slug` (gate público por comunidad), `/login`,
  `/dashboard`, `/brands`, `/gates`, `/admin`, `/demo` — las que el remix ya trae.
- **Qué NO cambia**: el dashboard/SPA de myfenrir.com; el contrato allowlist del
  Gatekeeper (sigue contra `www.myfenrir.com`); el gatekeeper worker.

## Cambios en el SPA

1. `vite.config.ts` nuevo: build SPA plano a `dist/` (fuera `.output/server`,
   `src/start.ts`, `src/server.ts`, middleware `attachSupabaseAuth`).
2. Eliminar `src/integrations/supabase` y `src/integrations/lovable`; el flujo
   de login/activate consume `POST /api/community-auth/*` (magic link + OAuth)
   con `fetch` same-origin y sesión por cookie.
3. `require-auth.tsx` pasa a validar contra `GET /api/community-auth/me`
   (endpoint existente del contrato) en vez de `supabase.auth.getUser()`.
   Endpoints disponibles hoy: `me`, `logout`, `magic-link/*`, `oauth/*`,
   `brand/*`, `admin/*`, `proposal`.

## Configuración

- **Pages project**: `community-bridge`, cuenta `e2a7eccb…` (donde vive la zona
  `myfenrir.com`). Custom domain `communities.myfenrir.com` (CNAME en la zona).
- **Secretos del proyecto nuevo**: `NEON_DATABASE_URL` (el de prod, NO pisar el
  de fenrir-bridge), `FENRIR_COMMUNITY_AUTH_SECRET`, `GOOGLE_CLIENT_ID/SECRET`,
  `MICROSOFT_CLIENT_ID/SECRET`, `APPLE_*`, `PUBLIC_SITE_URL=https://communities.myfenrir.com`.
  Fuente: `.env.local` de fenrir-bridge (mismos valores que prod actual).
- **Consolas OAuth**: añadir la redirect URI
  `https://communities.myfenrir.com/api/community-auth/oauth/callback/<provider>`
  a las apps Google/Microsoft/Apple existentes (alta de URI, no apps nuevas).

## Errores y estados

- Sin `NEON_DATABASE_URL` → los endpoints ya responden su "not configured"
  defensivo (comportamiento heredado del contrato).
- OAuth con URI sin registrar → error visible del provider; se valida en el
  smoke test antes de anunciar nada.

## Testing / verificación

1. `vite build` del SPA en modo estático + preview local (verificar `/g/:slug`,
   login magic link mock, estados vacíos).
2. Los tests existentes de fenrir-bridge no se tocan (sus functions no cambian).
3. Deploy al proyecto NUEVO y smoke test en vivo: página del gate, flujo OAuth
   de al menos Google, cookie de sesión, `/dashboard` gated.
4. Verificar que `www.myfenrir.com` sigue sirviendo su bundle intacto (no se
   despliega nada ahí).

## Futuro (fuera de alcance)

- Dedupe de las functions `community-auth` en un paquete compartido.
- Redirección de las rutas `/community/*` del SPA viejo hacia el subdominio.
- Migrar el allowlist del Gatekeeper al subdominio si algún día conviene.
