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

## 5. Sin confirmar que tarjeta y cripto COBREN de verdad

**Severidad: alta — bloquea ingresos. Diagnóstico a medias por falta de acceso.**

Se arregló que la pantalla **pregunte** por los rieles de pago. **No** está
confirmado que respondan que sí.

**Lo que sí quedó probado.** El error rojo `Unauthorized: No authorization
header provided` que salía en la tarjeta de pago venía de
`src/integrations/supabase/auth-middleware.ts:58` —única aparición de esa
cadena en todo el repo—, no del worker de facturación. `getFoundersBillingOptions`
llevaba `requireSupabaseAuth` aunque manda `{}` al worker, sin ningún dato de
usuario, así que un visitante sin sesión en `/upgrade` reventaba al montar la
tarjeta. Como las opciones nunca resolvían, tarjeta y cripto quedaban en
"being set up" aunque estuvieran vivas. Un fallo, tres síntomas. Middleware
retirado sólo de ese sondeo; los tres server fns que sí cobran lo conservan.

**Lo que NO se pudo verificar.** Si `COMMUNITY_BRIDGE_BILLING_SECRET` tiene el
mismo valor en sus tres referencias:

- `apps/fenrir-bridge/workers/fenrir-stars-payments.js:22` — lo consume
- `apps/community-bridge/src/lib/founders-billing.functions.ts:6` — lo envía
- `apps/community-bridge/src/lib/gate.functions.ts:138`

Los secretos de Cloudflare son de **sólo escritura**: no se pueden leer por API
ni por `wrangler`, y en la sesión no había `CLOUDFLARE_API_TOKEN` ni
`OP_SERVICE_ACCOUNT_TOKEN`. **No verificado**, ni a favor ni en contra.

**Cómo continuar cuando haya token — sin exponer valores.** El bearer es entre
servicios propios: sirve cualquier valor mientras sea idéntico en los tres
sitios. Para comparar sin leerlo, rotarlo a un valor nuevo en los tres a la vez
es más barato y seguro que intentar auditar el actual.

Y hay una prueba de extremo a extremo que no necesita ningún secreto: abrir
`/upgrade` **sin sesión** y mirar los rieles.

- Tarjeta y cripto **activas** → el secreto coincide y el sondeo funciona. Cerrado.
- Siguen apagadas → el worker está devolviendo `{"ok":false,"error":"unauthorized"}`
  (minúscula, una palabra — `fenrir-stars-payments.js:207, 266, 316`) y entonces
  **sí** es el secreto. Esa respuesta ya no llega cruda a pantalla: cae al texto
  genérico a propósito, porque el comprador no puede arreglarla.

Para ver cuál de los dos es, mirar los logs del worker: es el único sitio donde
la distinción queda registrada. El sondeo fallido se registra en el cliente con
`console.error("[billing] options probe failed", cause)`.

**Ojo con el falso negativo:** que la pantalla ya no muestre el error rojo **no**
significa que el cobro funcione. Sólo significa que la pregunta se hace y que el
fallo, si lo hay, se cuenta de forma humana.

---

## 6. Los dos espacios de nombres de slug — decisión tomada de hecho, no por acuerdo

**Severidad: media. Congelado a propósito; no reabrir sin leer esto entero.**

Hay dos vocabularios para nombrar una comunidad y durante meses nadie los casó:

- El bot y el gatekeeper usan **`community_slug`** (`myfenrir-core`,
  `thebadboi-gooning-club`), desde KV `community:*` y `COMMUNITY_SLUG`.
- La página pública usa **`cb_gate_configs.slug`**, que elige el admin.

`community_id` no los une: 5 de las 6 filas de `cb_gate_configs` dicen `fenrir`.
El síntoma medido: `/g/frisky`, `/g/frs`, `/g/goonbros`, `/g/sluty-gooners` y
`/g/tree` devuelven 200, mientras `/g/myfenrir-core` y
`/g/thebadboi-gooning-club` dan 404.

**La decisión ya está tomada en el código, no en una reunión.** El comando
`/gate` del gatekeeper (`fenrir-gatekeeper/worker/src/index.ts`, bloque
`--- /gate`) dice, textual:

> It is also the point where the two slug namespaces stop drifting. The bot and
> the Gatekeeper address a community by `community_slug`; the public page reads
> `cb_gate_configs.slug`. Every Gate created here writes both from one value, so
> the link the operator receives is the link that resolves.

Es decir: **para los Gates creados desde `/gate`, el problema no existe.** Se
escriben los dos nombres desde un único valor. Lo que queda son las filas
**anteriores** a ese comando.

**Impacto medido en su momento** (para no volver a contarlo):

| Medida | Valor |
|---|---|
| Filas en `cb_gate_configs` | 6 |
| Filas en `fenrir_gate_communities` | 16 |
| Slugs que ya coinciden entre ambas | **1** (`goonbros`) |
| Vistas totales, histórico completo | **17** |
| Hosts referrer distintos | **1** |

Ojo con esa cifra: `visitor_key` es `${visitorId}:${utcDayKey()}`, así que son
**17 visitante-días**, no 17 personas. El número real de humanos es ≤17 y
probablemente 2 o 3 probando durante diez días. No hay audiencia distribuida
que romper.

Además, 6 de las 16 filas de comunidades (`goo`, `goon`, `goonb`, `goonbr`,
`goonbro`, `goonbros`) se crearon **en 3 segundos** el 2026-08-03: un autosave
por pulsación de tecla. Cualquier plan tiene que contar con esa basura.

**Las tres opciones, si alguien decide reabrirlo:**

1. **Migrar `cb_gate_configs.slug` a `community_slug`.** Toca 5 de 6 filas,
   rompe 13 de 17 enlaces. Reversa: ya existe
   `cb_gate_configs_backup_20260816`; añadir `slug_legacy` + redirect 301.
   Riesgo: `myfenrir-core` no existe en `fenrir_gate_communities`.
2. **Tabla de mapeo.** Toca 0 filas, rompe 0 enlaces. Coste: una indirección
   permanente y dos fuentes de verdad que pueden divergir — el mismo tipo de
   deuda que causó esto.
3. **Un solo campo.** Toca las 6 filas y las 16 de comunidades. Reversa la más
   cara. Es la única que elimina la clase de bug de raíz.

**Recomendación de quien lo midió:** no tocarlo hoy. Con `/gate` escribiendo
ambos nombres, el sangrado está detenido y sólo queda limpiar el histórico —
que son 6 filas y ~17 visitante-días. Abrir este frente durante el go-live
compra riesgo sin comprar valor.

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
