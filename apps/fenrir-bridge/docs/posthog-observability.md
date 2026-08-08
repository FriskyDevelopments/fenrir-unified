# Observabilidad PostHog — MyFenrir

Rama: `feat/posthog-observability`. Nada de esto va a producción solo: el
despliegue de Pages/Workers lo dispara Francisco tras revisar el MR.

Este documento cubre la auditoría de PostHog (Max AI) sobre `myfenrir.com` y qué
se aplicó, qué se corrigió de la guía y qué queda pendiente de la mano de un
humano.

---

## 1. Correcciones a la guía de la auditoría

La guía traía tres supuestos que no se sostienen contra este repo. Se aplicó lo
correcto y se documenta el porqué, porque seguirlos al pie habría dado una
observabilidad que *parece* encendida y no captura nada.

### 1.1 `captureExceptions` no existe

La guía pide `captureExceptions: true`. En `posthog-js` la opción es
**`capture_exceptions`** (snake_case). Verificado contra la versión instalada
aquí, `posthog-js@1.407.3`:

```
node_modules/posthog-js/dist/module.d.ts:4230:capture_exceptions
```

`posthog.init()` ignora en silencio las claves que no conoce, así que la versión
camelCase habría dejado el error tracking apagado sin ningún aviso — exactamente
el estado que la auditoría quería arreglar. Se aplicó `capture_exceptions: true`.

### 1.2 El bot de MyFenrir no es Node — es Cloudflare Workers

La guía pide `npm install posthog-node`, `flushAt: 20`, `flushInterval: 10s` y
`shutdown()` en `beforeExit`. Nada de eso aplica aquí:

| Supuesto de la guía | Realidad de MyFenrir |
|---|---|
| El bot es un proceso Node de larga vida | El bot vive en `workers/fenrir-stars-payments.js` y en las Pages Functions de `functions/api/…` — runtime **Cloudflare Workers** |
| `posthog-node` | Usa APIs de Node ausentes en Workers; no arranca |
| `beforeExit` + `shutdown()` | No hay `process` ni ciclo de vida de proceso. Un Worker muere al terminar la petición |
| Cola con `flushAt: 20` | Una cola en memoria entre peticiones se pierde: cada invocación puede caer en otro isolate |

El equivalente correcto en Workers es **enviar el evento dentro de la propia
petición** (o vía `waitUntil`), que es lo que hace `functions/_lib/posthog.ts`:
un `fetch` directo contra la API de captura, sin SDK ni cola. Es más simple y no
pierde eventos.

Lo mismo para los handlers globales: `process.on("uncaughtException")` y
`unhandledRejection` **no existen** en Workers. El equivalente es
`withErrorTracking()`, que envuelve el handler; además da algo que los handlers
de Node no dan — la petición que provocó el fallo.

> Donde la guía **sí** aplica tal cual es en los bots de Python (ClipsFlow,
> friskyclaw). Ahí sí hay proceso de larga vida, cola y `shutdown()`.

### 1.3 `$ai_generation`: hoy no hay nada que envolver en este repo

Búsqueda sobre `functions/`, `workers/`, `src/` y `scripts/`: **cero**
referencias a `dashscope`, `openai`, `anthropic`, `qwen` o `chat/completions`.
MyFenrir no llama a ningún LLM hoy, así que no hay llamada que instrumentar.

El envoltorio queda construido y probado (`withAiGeneration()` en
`functions/_lib/posthog.ts`) para el momento en que el bot incorpore un modelo,
y usa exactamente el mismo contrato de propiedades que los bots que sí llaman a
LLMs. Emitir `$ai_generation` sintéticos ahora sólo ensuciaría el coste.

---

## 2. Lo que se aplicó en esta rama

| Fix | Archivo | Estado |
|---|---|---|
| FIX 1 · `capture_exceptions: true` | `src/services/posthog.ts` | ✅ aplicado |
| FIX 2 · `session_recording.maskAllInputs` | `src/services/posthog.ts` | ✅ aplicado |
| FIX 2 · `session_recording.recordCrossOriginIframes: false` | `src/services/posthog.ts` | ✅ aplicado |
| Session replay activo | `src/services/posthog.ts` | ✅ `disable_session_recording: false` |
| Detector de bucle de login | `src/services/posthog.ts` | ✅ `login_loop_detected` |
| Captura en el borde | `functions/_lib/posthog.ts` | ✅ |
| `$ai_generation` (envoltorio) | `functions/_lib/posthog.ts` | ✅ listo, sin call-sites |
| Error tracking en el borde | `functions/_lib/posthog.ts` | ✅ `withErrorTracking()` |
| Instrumentar el bot | `workers/fenrir-stars-payments.js` | ⛔ **bloqueado — ver §3** |

`recordCrossOriginIframes: false` importa aquí más que en otros productos:
MyFenrir embebe iframes de terceros (widgets de pago) y
grabarlos capturaría formularios de credenciales de otro origen.

---

## 3. Bloqueado: los archivos del bot los están tocando otras sesiones

Estado del árbol de trabajo cuando se escribió esto:

```
 M apps/fenrir-bridge/workers/fenrir-stars-payments.js      <- sesión FENRIR BOT OS
 M apps/fenrir-bridge/functions/api/telegram/webhook.ts     <- sesión FENRIR BOT OS
?? apps/fenrir-bridge/functions/_lib/lock-bot/              <- sesión FENRIR BOT OS (nuevo)
?? apps/fenrir-bridge/functions/api/lock-bot/               <- sesión FENRIR BOT OS (nuevo)
?? apps/fenrir-bridge/workers/fenrir-stars-payments.js.bak-1784883534
```

Esos son los archivos del bot. **No se tocaron a propósito**: editarlos habría
metido trabajo sin commitear de otra sesión dentro de este MR, o habría creado
un conflicto en el momento en que esa sesión commitee.

El wiring queda preparado. Son tres inserciones, y aplicarlas es trabajo de
quien tenga el bot en la mano ahora mismo:

```js
// 1) al principio de workers/fenrir-stars-payments.js
import { capture, captureAnonymous, captureException } from "../functions/_lib/posthog.ts";

// 2) al recibir un update de Telegram
await capture(env, "message_received", "telegram", update?.message?.from?.id, {
  chat_type: update?.message?.chat?.type,
  has_command: /^\//.test(update?.message?.text ?? ""),
});

// 3) primer mensaje de una conversación
await capture(env, "conversation_started", "telegram", update?.message?.from?.id, {
  entry_point: "telegram",
});

// 4) envolver el handler exportado
export default { fetch: withErrorTracking("stars-bot", handler) };
```

Cuando el bot incorpore un LLM, la llamada va dentro de `withAiGeneration()`:

```js
const reply = await withAiGeneration(
  env,
  { traceId: conversationId, model: "qwen-plus", provider: "dashscope",
    input: messages, platform: "telegram", id: userId, spanName: "bot_reply" },
  () => callModel(messages),
  (res) => ({ output: res.choices, inputTokens: res.usage?.prompt_tokens,
              outputTokens: res.usage?.completion_tokens })
);
```

---

## 4. Secretos — nunca literales

La guía trae `<YOUR_PROJECT_API_KEY>` de placeholder. Aquí **no se escribe
ninguna llave en el repo**. Las dos variables se leen del entorno:

| Variable | Dónde | Origen |
|---|---|---|
| `VITE_POSTHOG_PROJECT_TOKEN` | build de Vite (Pages) | `op://Personal/PostHog Frisky/project_api_key` |
| `VITE_POSTHOG_HOST` | build de Vite (Pages) | `https://us.i.posthog.com` (no es secreto) |
| `POSTHOG_PROJECT_TOKEN` | binding del Worker | mismo `op://` |
| `POSTHOG_HOST` | binding del Worker | ídem |

Alta en el Worker (el valor nunca pasa por el historial del shell):

```bash
fsc get POSTHOG_PROJECT_TOKEN | \
  npx wrangler secret put POSTHOG_PROJECT_TOKEN --config wrangler.fenrir-stars.toml
```

> ⚠️ El ítem `PostHog` **todavía no existe** en 1Password: una búsqueda sobre la
> bóveda no devuelve ninguna entrada con «posthog». Francisco tiene que crearlo
> antes de que nada de esto emita un solo evento. Ver §6.

---

## 5. Dashboards y alertas

No se pudieron crear vía API: el conector MCP de PostHog no está autorizado en
esta sesión y no hay Personal API Key (`phx_…`) en 1Password. Quedan aquí como
definición exacta para crearlos en la UI o para que un agente con MCP los cree
de un tirón.

### Dashboard «MyFenrir · Bot health»

| Insight | Tipo | Definición |
|---|---|---|
| Llamadas a LLM / día | Trends | `$ai_generation`, count, breakdown `$ai_model` |
| Coste LLM / día | Trends | `$ai_generation`, sum de `$ai_total_cost_usd` |
| Latencia LLM p95 | Trends | `$ai_generation`, p95 de `$ai_latency` |
| Tasa de error LLM | Trends (fórmula) | `$ai_generation` where `$ai_is_error = true` ÷ total |
| Trazas | Trends | `$ai_generation`, unique de `$ai_trace_id` |
| Usuarios únicos del bot | Trends | `message_received`, unique users |
| Conversaciones iniciadas | Trends | `conversation_started`, count |
| Excepciones del bot | Trends | `$exception` where `service = fenrir-bridge` |

### Dashboard «MyFenrir · Site health»

| Insight | Tipo | Definición |
|---|---|---|
| Pageviews | Trends | `$pageview`, count |
| Web vitals | Trends | `$web_vitals`, p75 de LCP / INP / CLS |
| Errores JS | Trends | `$exception` where `service = myfenrir-web`, breakdown por `$exception_type` |
| Bucle de login | Trends | `login_loop_detected`, unique users ← **el bug conocido** |
| Embudo de login | Funnel | `login_started` → `login_succeeded` |
| Sesiones grabadas | Trends | `$snapshot`, count (verifica que el replay realmente graba) |

### Alertas (dejar creadas, activar cuando fluya data)

| Alerta | Condición | Por qué |
|---|---|---|
| Pico de errores | `$exception` > 2× la media de 7 días, ventana 1 h | Regresión recién desplegada |
| Tasa de error LLM | `$ai_is_error = true` > **5 %** en 1 h | Proveedor caído o clave caducada |
| Errores JS | `$exception` de `myfenrir-web` > 10 en 1 h | Rompimiento del front |
| Bot en silencio | `message_received` = **0** en 6 h | El bot está muerto y nadie se entera |
| Bucle de login | `login_loop_detected` > 0 en 1 h | Cero tolerancia: es el bug caro |

«Bot en silencio» es la que más vale de las cinco: un bot caído no genera
errores, genera *nada*, y es el único fallo que ninguna alerta basada en errores
puede detectar.

---

## 6. Qué necesita Francisco

1. **Crear el ítem de PostHog en 1Password** (hoy no existe). Campos:
   `project_api_key` (`phc_…`, de PostHog → Settings → Project → Project API Key)
   y `personal_api_key` (`phx_…`, de Settings → Personal API Keys, con scopes
   `insight:write`, `dashboard:write`, `feature_flag:write`, `query:read`).
   El segundo es el que permite crear los dashboards y las alertas sin clicar.
2. **Autorizar el conector MCP de PostHog** en los ajustes de conectores de
   claude.ai. Sin eso ningún agente puede crear insights, flags ni experimentos.
3. **Encender Error Tracking** en el proyecto: PostHog → Settings →
   Error Tracking. El código ya emite `$exception`; el producto está apagado.
4. **Verificar Session Replay**: PostHog → Settings → Session Replay. La
   auditoría lo marcó «sin verificar».
5. **Publicar las variables** en Cloudflare Pages (build) y como secreto del
   Worker (§4).
6. **Revisar y mergear el MR** de esta rama. Nada se despliega solo.
