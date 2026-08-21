# Deuda técnica — Community Bridge

Registro de cosas que sabemos que están mal y decidimos **no** arreglar ahora,
con la razón. No es una lista de deseos: cada entrada se abrió porque alguien
la midió y decidió posponerla conscientemente.

Última actualización: 2026-08-21 (America/Monterrey).

---

## 1. `SUPABASE_SERVICE_ROLE_KEY` vive en el worker del camino del miembro

**Severidad: alta. Preexistente. Pospuesta a propósito.**

El canon del proyecto dice: *comunidad = Neon; admin = Supabase; Supabase en el
camino del miembro es el bug.* Hoy no se cumple del todo.

`communities.myfenrir.com` se despliega como un solo Worker, y ese Worker carga
`SUPABASE_SERVICE_ROLE_KEY`. La service-role key **evita RLS por completo**: es
una credencial de administrador. El proceso que atiende a visitantes anónimos
del Gate la tiene en su entorno.

**Dónde se usa** (`supabaseAdmin`, de `src/integrations/supabase/client.server.ts`,
que hace `createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY)`):

- `src/lib/admin.functions.ts` (2 usos)
- `src/lib/courtesy.functions.ts`
- `src/routes/brand-asset.$.ts`
- `src/routes/api.internal.telegram-destination.ts` — ingreso bot-only añadido
  en este ciclo; amplía la superficie, no la creó

`scripts/check-production-secrets.mjs` **exige** esta variable en el preflight,
así que hoy un despliegue de producción sin ella falla a propósito.

**Por qué no se arregló hoy:** separarlo obliga a mover las rutas admin a otro
Worker o a sustituir la service-role key por RLS más un rol acotado. Es
rediseñar autenticación en pleno go-live. El riesgo del cambio supera hoy al
riesgo que mitiga.

**Cuándo se paga:** antes de abrir el Gate a comunidades de terceros. Mientras
el único operador sea Fenrir, el radio de daño está acotado; deja de estarlo en
cuanto un tercero pueda inducir tráfico a esas rutas.

**Trampa conocida:** en Neon, `applicant_id` **ya es un UUID de Supabase**.
Sacar Supabase del camino del miembro es **re-llavear filas existentes**, no
desconectar un cable. Cualquier plan necesita reversa; nunca borrado.

---

## 2. El 503 honesto se transporta por cabecera, no por `setResponseStatus`

**Severidad: baja. Es un puente, y funciona.**

`getPublicGate` distingue "consulté y no hay Gate" (404) de "no pude consultar"
(503). Pero el render del documento fija el status final y pisa cualquier
`setResponseStatus` hecho más adentro. **Medido en vivo**, las dos rutas:

- lanzando desde el loader → `500`
- devolviendo desde el loader → `200`

Solución actual: el camino del Gate marca la respuesta con la cabecera interna
`x-fenrir-gate-unavailable`, y `src/server.ts` (`applyUnavailableStatus`) la
traduce a `503` real, conserva `Retry-After` y `Cache-Control: no-store`, y
borra la marca antes de salir. Verificado en vivo con `wrangler dev --local`:

```
HTTP/1.1 503 Gate directory unavailable
Cache-Control: no-store
Retry-After: 30
```

**Cuándo se paga:** cuando TanStack Start permita fijar el status del documento
desde la ruta. Entonces esto se colapsa a un `setResponseStatus` y se borra
`applyUnavailableStatus`.

---

## 3. 12 errores de TypeScript preexistentes

**Severidad: media. Congelados a propósito durante el go-live.**

`npx tsc --noEmit` reporta 12 errores que **no** rompen el build (`vite build`
usa esbuild, que borra tipos sin comprobarlos). Se dejaron intactos para no
ampliar el diff justo cuando el objetivo era reducir riesgo.

- `src/lib/gate-analytics.functions.ts` — 2 × `TS2352`: casts de
  `NeonQueryPromise` a `Promise<T[]>`. Probablemente inertes; **no ejecutados**.
- `src/routes/g.$slug.tsx` — 1 × `TS2339`: `community_id` no existe en el tipo
  `GateConfig` aunque `getPublicGate` sí lo devuelve. El tipo va por detrás del
  dato.
- resto en `src/lib/access.functions.ts` — `telegram_id` es `number | null` en
  los tipos de Supabase y `string` en el consumidor, más varios `TS2322` de
  literales de unión que se ensanchan a `string`.

**Ojo:** el `TS2339` de `context.user` que había en este grupo **sí se arregló**
(ver abajo); era el único con rotura garantizada en runtime.

**Cuándo se paga:** primer sprint después del go-live, en un PR propio.

---

## 4. Dos respaldos `.bak-*` siguen dentro de `public/`

**Severidad: media mientras existan en el árbol de trabajo.**

`apps/fenrir-bridge/public/privacy/index.html.bak-20260817` y el equivalente de
`terms/`. Vite copia `public/` **verbatim** al build, así que si se despliegan
quedan servidos en `/privacy/index.html.bak-20260817` — texto legal viejo
públicamente accesible junto al vigente.

**Estado:** archivados en `apps/fenrir-bridge/legal-archive/` (copia verificada
por sha256) y cubiertos por el patrón `*.bak-*` en `.gitignore`, así que **no
entran en git** y no llegan a producción por CI.

**Lo que falta:** borrar los dos originales de `public/`. El agente no pudo
(`rm: Operation not permitted` — el mount de Cowork crea pero no borra). Un
despliegue hecho desde el árbol de trabajo local, saltándose git, todavía los
incluiría.

---

## Resueltos en este ciclo (para que no se reabran)

- **`context.user.email` → `applicantEmail(context.claims)`** en
  `src/lib/access.functions.ts` (3 usos). `requireSupabaseAuth` nunca inyectó
  `user`, sólo `{ supabase, userId, claims }`; las tres lecturas reventaban con
  `TypeError`. No se sustituyó por `claims.email` a secas porque en el
  `JwtPayload` de supabase-js **`email` es opcional** (`email?: string`) y este
  es el camino de Telegram, donde la identidad puede no traer correo: se
  resuelve a `null` explícito para que la ausencia quede como NULL en una
  columna nullable y como `emailSent: false` visible, no como `undefined`.
- **Mensajes del handoff de Telegram.** Un único texto —*"Your access request
  must be accepted…"*— cubría tres estados distintos y culpaba a una solicitud
  pendiente aunque la causa real fuera que el Gate no tiene destino
  configurado. Separados en tres, ES y EN, en `src/lib/gate-availability.ts`.
