# Diagnóstico: "Link your MyFenrir account" — ¿dónde saco el código?

Fecha: 2026-08-09 · Repo: `~/fenrir-unified` · Sin secretos ni tokens en este reporte.
Verificado contra el código real (no supuesto). Deploy/preview NO ejecutable desde este entorno.

---

## TL;DR (respuesta directa a Francisco)

**No hay ningún "código de 6 caracteres" que sacar en la web a la que te manda el bot.**
El bot que estás probando (`fenrir-stars-payments`) usa un mecanismo de **deep-link**, no de
código-para-pegar. El código lo genera la web y se abre **solo** en Telegram; tú nunca lo copias.

El problema: el botón del bot te manda a `communities.myfenrir.com/dashboard`, que es **otra app**
(`community-bridge`) y que además:
1. redirige a `/activate`, una pantalla que te pide **pegar un código de 6 chars que el bot nunca
   emite** (flujo inverso e incompatible), y
2. ese dominio está **"Verifying"** en Cloudflare (según tu propia auditoría del 8-ago), o sea ni
   siquiera sirve bien esa app todavía.

**Dónde está el flujo que SÍ funciona hoy:** `www.myfenrir.com` → inicia sesión → panel **`/main`**
→ botón **"Link Telegram ID"**. Ese botón genera el deep-link y **abre Telegram automáticamente**
para confirmar el enlace. Cero código que teclear.

---

## 1) Qué bot y qué handler emiten el mensaje

- **Worker:** `apps/fenrir-bridge/workers/fenrir-stars-payments.js`
- **Handler:** `sendTelegramLinkStart()` (se dispara con `/link`), líneas ~259–293. Texto exacto:
  - "1. Open MyFenrir and sign in."
  - "2. Choose Link Telegram in the Telegram section."
  - "3. Return here using the secure confirmation link MyFenrir creates."
  - "The Open MyFenrir Mini App button is now enabled in this chat."
- Constante del botón: `MYFENRIR_APP_URL = "https://communities.myfenrir.com/dashboard"` (línea 23).
- Hay un **segundo** handler equivalente (bot del gate) en
  `apps/fenrir-bridge/functions/api/telegram/webhook.ts` (`appUrl = "https://communities.myfenrir.com/dashboard"`, línea 202)
  que dice "Open MyFenrir → *Settings → Link Telegram*".

## 2) Mecanismo REAL que implementa el código hoy (deep-link, D1)

Es **la web genera → el bot consume**, no un código para pegar:

1. En la web (fenrir-bridge) `POST /api/telegram/link` (`functions/api/telegram/link.ts`) crea un
   registro en **Cloudflare D1** tabla `telegram_account_link_codes` (status `pending`, expira 15 min)
   y devuelve `url = https://t.me/<bot>?start=link_<code>`.
   - El `code` es un token de **24 caracteres hex** (`createTelegramAccountLinkCode`,
     `functions/_lib/telegram-identity.ts`). No es un "código de 6".
2. La UI del panel abre esa URL. En Telegram llega `/start link_<code>`.
3. El worker lo parsea con `linkCodeFromStart()` (regex `^/start\s+link_([a-z0-9_-]{8,64})$`) y lo
   valida con `consumeTelegramLinkCode()` contra la **misma** tabla D1, escribiendo
   `telegram_identity_links` (telegram_user_id ↔ frisky_user_id/org/email).

La UI que dispara todo esto: `apps/fenrir-bridge/src/routes/DashboardRoute.tsx` →
`linkTelegramIdentity()` (≈ línea 522) → `telegramIdentityService.start()` (`POST /api/telegram/link`)
→ `window.open(result.url)`. **Abre Telegram solo; el usuario no teclea nada.**
El panel está en **`/main`** (`managedDashboardPath = "/main"`, `src/App.tsx`).

➡️ Este medio-flujo (web genera deep-link + bot consume por D1) es **coherente y funcional**.

## 3) La "Telegram section" que menciona el mensaje: ¿existe? — el bug

El botón del bot NO apunta a `/main` (fenrir-bridge). Apunta a
`communities.myfenrir.com/dashboard`, que es la **otra** app: `apps/community-bridge` (TanStack,
canonical `clipsflow-auth-hub.lovable.app`). Ahí el enlace de Telegram es el **flujo opuesto**:

- `community-bridge/src/routes/dashboard.tsx`: si el usuario **no** tiene `telegramId`, **redirige a
  `/activate`** (líneas 49–51). No hay ninguna "Telegram section" que genere un deep-link/código.
- `community-bridge/src/routes/activate.tsx`: te dice **"1. Abre el bot. 2. Envía `/link` para recibir
  un código de 6 caracteres. 3. Pégalo aquí."** y llama a `redeemTelegramLinkCode({ code })`.
- Ese redeem es un **RPC de Supabase** `redeem_telegram_link_code` sobre la tabla **Supabase**
  `telegram_link_codes` (migración `20260622024653…sql`). Esa tabla necesita que **alguien inserte
  primero** `(code, telegram_id)`… y **NINGÚN bot del repo lo hace**. Solo existen funciones
  `redeem_*` (consumir), no una que **emita** el código de 6 y lo mande por Telegram.

Es decir, chocan **dos diseños incompatibles**:

| | Diseño A (el bot que pruebas) | Diseño B (la web /activate) |
|---|---|---|
| Dirección | Web **genera**, bot **consume** | Bot **emite**, web **consume (pegar)** |
| Store | Cloudflare **D1** `telegram_account_link_codes` | **Supabase** `telegram_link_codes` |
| Código | 24 hex, deep-link `?start=link_<code>` | 6 chars `[A-Z0-9]`, se teclea |
| Estado | Funciona (fenrir-bridge `/main`) | **Huérfano**: nadie emite esos códigos |

Y por si fuera poco: el mensaje del bot describe el **Diseño A** ("return via the secure confirmation
link MyFenrir creates") pero te manda a una página del **Diseño B**. Resultado: **círculo sin salida**
→ *"¿dónde saco el código?"*. La respuesta honesta: **de ningún lado en esa página; el código de 6
no lo emite ningún bot.**

### Estado en producción (evidencia)
- Según tu auditoría `ops/MYFENRIR_APP_MIRROR_2026-08-08.md`: `communities.myfenrir.com` es Custom
  Domain del **proyecto `fenrir-bridge`** y está **"Verifying" (falta DNS)** — no sirve bien la app
  community-bridge todavía. Además fenrir-bridge no tiene ruta `/dashboard` (su panel es `/main`).
- `www.myfenrir.com` (fenrir-bridge) está **live y sano** (auditoría `AUDIT_MYFENRIR_2026-08-08.md`),
  SSO OK. El botón "Link Telegram ID" en `/main` es el único camino end-to-end operativo hoy.

## 4) Causa raíz y qué hacer

**Causa raíz:** el bot enruta a una superficie equivocada/a-medio-cablear (`communities.myfenrir.com/dashboard`,
Diseño B huérfano y en Verifying) en vez de a la que implementa exactamente lo que el propio mensaje
promete (`www.myfenrir.com/main`, Diseño A funcional). No es que "falte el código": es que **la mitad
generadora del Diseño A vive en otro dominio** y el bot no apunta ahí.

### (a) Desbloqueo inmediato para Francisco (sin tocar código)
1. Abre **https://www.myfenrir.com** e inicia sesión (Apple/Google/Microsoft).
2. Ve al panel **`/main`**.
3. Pulsa **"Link Telegram ID"**. Se abre Telegram con el bot y `/start link_<code>` → queda vinculado.
   No hay código que copiar.

### (b) Arreglo acotado propuesto (repointar el bot) — NO aplicado a prod
El fix mínimo y coherente: apuntar el bot al panel que sí genera el deep-link y alinear el copy.
Cambios en `apps/fenrir-bridge/workers/fenrir-stars-payments.js`:

```diff
-const MYFENRIR_APP_URL = "https://communities.myfenrir.com/dashboard";
+const MYFENRIR_APP_URL = "https://www.myfenrir.com/main";
```

```diff
   await telegramApi(env, channel, "sendMessage", {
     chat_id: message.chat.id,
     text: [
       "MyFenrir account linking",
       "",
       "1. Open MyFenrir and sign in.",
-      "2. Choose Link Telegram in the Telegram section.",
-      "3. Return here using the secure confirmation link MyFenrir creates.",
+      "2. In your dashboard, tap \"Link Telegram ID\".",
+      "3. Telegram opens automatically to confirm — there is no code to copy.",
       "",
       "The Open MyFenrir Mini App button is now enabled in this chat."
     ].join("\n"),
```

Y, por consistencia, en `apps/fenrir-bridge/functions/api/telegram/webhook.ts` (línea 202):

```diff
-  const appUrl = "https://communities.myfenrir.com/dashboard";
+  const appUrl = "https://www.myfenrir.com/main";
```

**Por qué no lo apliqué/commité:** el working tree está en la rama `codex/fix-myfenrir-favicon` con
~20 archivos modificados sin commitear (incluidos `webhook.ts` y `DashboardRoute.tsx`) por otra tarea
en curso, y este entorno no puede build/deploy a Cloudflare (sin egress, wrangler interactivo). Meter
un commit ahí mezclaría trabajo ajeno y no debo tocar prod a ciegas. Aplica el diff en una rama limpia
y despliega a **PREVIEW** (`--branch link-fix`) antes de promover a `main`.

### (c) Arreglo "correcto" a mediano plazo (decisión de producto)
Si `communities.myfenrir.com` (community-bridge) debe ser el hogar real del enlace de Telegram:
1. Termina el DNS de `communities.myfenrir.com` (sacarlo de "Verifying").
2. Reemplaza el flujo `/activate` de "pegar código de 6" por una **sección Telegram que genere el
   deep-link** (Diseño A), llamando al generador D1 (`/api/telegram/link`) vía sesión compartida
   (`community-sso` / `sharedSession` ya existen) — y **retira** la tabla/RPC Supabase
   `telegram_link_codes` huérfana para no dejar dos stores.
3. Unifica identidad: hoy community-bridge lee "linked" desde Supabase `user_roles.telegram_id`, pero
   el bot escribe en D1 `telegram_identity_links`. Aunque enlaces por `/main`, communities podría
   seguirte viendo "no linked". Hay que leer de una sola fuente.

**Recomendación:** aplica (b) ya para desbloquear (preview → prod), y agenda (c) como el arreglo de
arquitectura. Necesita tu OK porque define si el hogar del enlace es `www` o `communities`.
