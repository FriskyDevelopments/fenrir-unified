# Superficie de facturación — mapa y diagnóstico

**Fecha:** 2026-08-21 · **Estado:** diagnóstico. **No se movió nada.**

## Hallazgo principal

El checkout del operador (`/upgrade`) y la consola de admin (`/admin`) **viven hoy
en la misma app y el mismo host que la puerta del miembro** (`/g/$slug`).

No están separados. Comparten:

| Qué comparten | Dónde |
|---|---|
| El mismo bundle y el mismo router | `src/routeTree.gen.ts` — `upgrade.tsx`, `admin.tsx` y `g.$slug.tsx` son rutas hermanas de `src/routes/` |
| El mismo shell y providers | `src/routes/__root.tsx` → `BrandProvider` + `AuthProvider` + `Toaster` envuelven las tres |
| El mismo host declarado | `src/config/brands.ts:114` — `hosts: ["myfenrir.com", "www.myfenrir.com", "communities.myfenrir.com"]` en el brand `myfenrir` |
| La misma cookie de sesión | `src/integrations/supabase/shared-session.ts:29` — dominio `.myfenrir.com` para todas las superficies |
| El mismo favicon y `<head>` | `__root.tsx` — `title: "MyFenrir"`, `icon: /fenrir-mark.svg` |

`src/config/brands.ts:19` incluso comenta que `communities.*` "es la superficie
separada del Community Bridge" — pero la separación es de *brand config*, no de
dominio ni de despliegue. Es el mismo Worker sirviendo las tres rutas.

### Lo único que ya está bien

- **`/upgrade` no carga `telegram-web-app.js`.** Verificado: `grep -rn "telegram-web-app" src/` no devuelve nada. La página es web normal, fuera del perímetro de Mini App. Eso es lo que sostiene los rieles de Stripe y NOWPayments hoy.
- **`/upgrade` no está detrás de `RequireAuth`.** Solo `admin.tsx` lo usa. El checkout es alcanzable sin sesión (las server functions sí exigen auth vía `requireSupabaseAuth`).

### El nudo, con rutas exactas

1. `src/routes/upgrade.tsx` y `src/routes/g.$slug.tsx` — mismo directorio, mismo router, mismo build.
2. `src/routes/__root.tsx:100-150` — un único shell para operador y miembro.
3. `src/config/brands.ts:114` — `communities.myfenrir.com` es el host del brand que sirve ambas.
4. `src/integrations/supabase/shared-session.ts` — sesión compartida en `.myfenrir.com`; separar dominios obliga a decidir si el operador sigue dentro de esa cookie.

Sacar el checkout a su propio dominio toca DNS, el `wrangler.jsonc` (hoy vacío,
solo `workers_dev: false`) y la cookie compartida. **No es trabajo de esta tarea.**

## Cómo quedó preparado el rediseño

`upgrade.tsx` y `components/billing/pack-rails.tsx` se reescribieron para ser
**levantables**: declaran sus propios tokens de color en el wrapper en vez de
heredar `--primary` del tema de la puerta. Mover el archivo a otro dominio es
copiar y pegar, no re-skinear. Tampoco introducen ninguna dependencia de
Telegram.

## Pendiente de backend (una sola cosa)

`createFoundersNowPaymentsCheckout` (`src/lib/founders-billing.functions.ts:91`)
tiene `.validator(() => undefined)` — no acepta periodo. `createFoundersStripeCheckout`
sí acepta `billingPeriod: "monthly" | "annual"`.

Por eso el plan anual queda **vivo en tarjeta y deshabilitado en cripto**, con la
razón escrita en pantalla ("La factura anual en cripto todavía no está
conectada"), en vez de un botón que cobre mensual en silencio. Conectar el
periodo anual en cripto es añadir el parámetro al validator y pasarlo al worker.

## Bloqueo pre-existente, ajeno a este cambio

`npm run dev` no arranca. `src/routes/g.$slug.tsx:153` importa
`@tanstack/react-start/server` dentro de un módulo alcanzable desde cliente; el
import-protection plugin lo rechaza y devuelve 500 en el entry de cliente, así
que **ninguna ruta carga en dev**. Viene del árbol sin commitear, no de este
trabajo. No se tocó.

Para poder grabar el movimiento sin desplegar se añadió `.motion-preview/` — un
harness aislado que monta el componente real con las server functions
stubbeadas. Nada en `src/` lo importa. Se puede borrar.
