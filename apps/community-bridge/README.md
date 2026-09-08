# Community Bridge

Canonical standalone Community Bridge application for Fenrir. This directory is
the product surface extracted from the Lovable FENRIR Access Control remix.

## Product boundary

- `myfenrir.com` remains the main Fenrir dashboard for account, billing, Stars,
  Telegram locks, domains, and workspaces.
- Community Bridge owns community brands, public gates, gate previews, gate
  analytics, and community administration.
- The main dashboard launches this app at `https://gate.myfenrir.com/dashboard`.
- Supabase remains the central identity layer. D1 remains Fenrir paid-tier and
  entitlement truth. Neon remains community membership, invite, review, and
  audit truth.

## Source of truth

The UI and route structure in this app are canonical for Community Bridge. The
Lovable/Supabase implementation is only the presentation/reference starting
point; production data access must be adapted to Fenrir's existing APIs and
Neon/D1 contracts before deployment.

## Local development

```bash
npm install
npm run dev
```

Do not commit `.env`, secrets, `node_modules`, build output, or local Astro/Vite
generated state.

## Trust & safety — moderación de imágenes y nombres

La política de la comunidad es: **desnudez adulta permitida; menores nunca**.
El control NO es "bloquear desnudez", es **estimar edad aparente** y bloquear
material de abuso infantil (CSAM). Eso obliga a capas distintas, porque ninguna
resuelve el problema sola.

| Capa                          | Qué resuelve                       | Con qué                                     | Costo           |
| ----------------------------- | ---------------------------------- | ------------------------------------------- | --------------- |
| 1. Hash-match CSAM conocido   | Material ya catalogado por NCMEC   | **Cloudflare CSAM Scanning Tool**, PhotoDNA | Gratis          |
| 2. Edad aparente / CSAM nuevo | Material que ningún hash conoce    | Hive AI, Thorn Safer                        | De pago         |
| 3. Vibe check general         | ¿Hay persona? ¿está entrando?      | `fenrir-bridge/functions/_lib/image-guard`  | Según proveedor |
| 4. Nombres de usuario         | Términos codificados en el texto   | Moderación de texto + blocklist             | Bajo            |
| 5. Revisión humana + reporte  | Lo que las capas anteriores marcan | NCMEC CyberTipline                          | —               |

### Capa 1 — Cloudflare CSAM Scanning Tool

Gratis para **todos los planes**, incluido el free. Desde la actualización de
2025 ya **no exige credenciales propias de NCMEC**, que era la barrera de
entrada. Se activa en el dashboard: **Caching → Configuration**, indicando un
email para las notificaciones de detección. Compara contra listas de hashes
difusos de NCMEC y otras organizaciones de protección infantil; ante una
coincidencia genera un evento, bloquea el acceso donde aplica y avisa al dueño
del sitio.

> ⚠️ **Limitación que nos afecta:** solo escanea contenido **servido a través
> del caché de Cloudflare de la zona**. Hoy los uploads viven en Supabase
> Storage (`brand-assets`, `gate-media`) y las fotos del bot pasan por Telegram,
> así que **el tool no las ve**. Para que la capa 1 sea real hay que servir esos
> archivos desde el dominio propio a través de Cloudflare — es decir, mover el
> storage a **R2 detrás de `communities.myfenrir.com`**.

Docs: https://developers.cloudflare.com/cache/reference/csam-scanning/

### Capa 3 — el vibe check no es el control de CSAM

`image-guard` es agnóstico de proveedor: arma un request OpenAI-compatible
(`POST {baseUrl}/chat/completions` con `image_url` en data URI) y encadena
`primaryModel` → `fallbackModels`. Cambiar a Mistral (Pixtral), OpenRouter o
LiteLLM es **configuración, no código**.

Dos reglas duras:

1. **Nunca uses un LLM general como control de CSAM.** No está entrenado ni
   evaluado para eso, falla en ambas direcciones, y no hay forma de auditar su
   tasa de error. Además los ToS de los proveedores prohíben enviarles ese
   material: el filtro no puede consistir en reenviárselo a un tercero.
2. **El prompt por defecto todavía no refleja nuestra política.** Hoy pregunta
   _"appropriate for a general audience (no nudity…)"_ y rechaza toda desnudez.
   Con la política real la pregunta es la edad aparente, no la desnudez.
   Pendiente en `image-guard/prompts.ts`.

### Obligaciones legales (no son opcionales)

- **Reportar, no solo borrar.** Ante una detección de la capa 1 hay obligación
  de **preservar la evidencia y reportar a NCMEC CyberTipline**
  (18 U.S.C. § 2258A en EE.UU.). Borrar y seguir no cumple.
- **18 U.S.C. § 2257:** alojar contenido sexualmente explícito obliga a
  **conservar registros de edad e identidad de las personas que aparecen**. No
  basta con clasificar la imagen: es un requisito de expediente.
- **Verificación de edad para acceder:** UK Online Safety Act y varios estados
  de EE.UU. Se resuelve con un vendor (Yoti, Persona, Incode), no con visión por
  computadora.

Confirmar el alcance con abogado según la jurisdicción de constitución de Frisky
Developments: si aplica el § 2257, el diseño del storage y de los expedientes
cambia bastante.
