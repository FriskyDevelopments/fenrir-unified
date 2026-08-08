/**
 * PostHog para las Pages Functions de Fenrir Bridge (runtime Cloudflare Workers).
 *
 * Sin SDK a propósito. `posthog-node` asume APIs de Node que en el runtime de
 * Workers no existen o pesan de más; la API de captura de PostHog es un POST
 * JSON, así que aquí se habla directamente con ella vía `fetch`. Cero
 * dependencias nuevas, cero riesgo de romper el bundle.
 *
 * Postura idéntica a `functions/_lib/honeybadger.ts`, que es el sink de errores
 * que ya existe aquí: **inerte sin llave**. Si `POSTHOG_PROJECT_TOKEN` no está
 * en el env del binding, cada función devuelve sin hacer nada y la ruta se
 * comporta igual. La analítica nunca puede ser la razón de que un webhook de
 * pago falle.
 *
 * Identidad: el `distinct_id` es `"telegram:<id>"` o el user id de Supabase —
 * la misma forma que usan ClipsFlow y HostCasa, para que la misma persona sea
 * la misma persona en todo el ecosistema Frisky dentro de un único proyecto de
 * PostHog.
 */

export type PosthogEnv = {
  POSTHOG_PROJECT_TOKEN?: string;
  POSTHOG_HOST?: string;
};

const DEFAULT_HOST = "https://us.i.posthog.com";

/** Identidades falsas: son bugs, no casos borde. Ver `distinctId()`. */
const FALSY_IDS = new Set(["", "0", "none", "null", "undefined", "false"]);

/** Bucket anónimo para eventos sin persona fiable (webhook sin firma, cron…). */
export const ANONYMOUS_ID = "anonymous:unresolved";

/**
 * Construye un distinct_id, o `null` si la identidad no es de fiar.
 *
 * `0`, `""`, `"undefined"` y compañía son la clase de defecto que en ClipsFlow
 * apareció como `telegram:0`: una concesión de acceso atribuida a una persona
 * fantasma. Se bloquea en el borde para que no llegue nunca a PostHog.
 */
export function distinctId(platform: string, id: unknown): string | null {
  const raw = id === null || id === undefined ? "" : String(id).trim();
  if (FALSY_IDS.has(raw.toLowerCase())) return null;
  return `${platform || "unknown"}:${raw}`;
}

type CaptureInput = {
  event: string;
  distinct: string;
  properties?: Record<string, unknown>;
};

async function send(env: PosthogEnv, body: CaptureInput): Promise<void> {
  const token = env.POSTHOG_PROJECT_TOKEN?.trim();
  if (!token) return; // inerte sin llave
  const host = env.POSTHOG_HOST?.trim() || DEFAULT_HOST;
  try {
    await fetch(`${host.replace(/\/$/, "")}/i/v0/e/`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: token,
        event: body.event,
        distinct_id: body.distinct,
        properties: {
          ...(body.properties ?? {}),
          service: "fenrir-bridge",
          surface: "edge",
        },
        timestamp: new Date().toISOString(),
      }),
    });
  } catch {
    // Un fallo de red hacia PostHog no puede tocar la respuesta de la ruta.
  }
}

/**
 * Captura un evento para una persona. Nunca lanza.
 *
 * Si la identidad es falsa NO se pierde el hecho: se emite
 * `identity_resolution_failed`, que es en sí misma la señal más importante que
 * puede producir una ruta de pago o de acceso.
 */
export async function capture(
  env: PosthogEnv,
  event: string,
  platform: string,
  id: unknown,
  properties: Record<string, unknown> = {}
): Promise<void> {
  const did = distinctId(platform, id);
  if (did === null) {
    await send(env, {
      event: "identity_resolution_failed",
      distinct: ANONYMOUS_ID,
      properties: { ...properties, platform, blocked_event: event, raw_id: String(id) },
    });
    return;
  }
  await send(env, { event, distinct: did, properties: { ...properties, platform } });
}

/** Captura sin persona asociada (webhook rechazado, cron, sondeo). Nunca lanza. */
export async function captureAnonymous(
  env: PosthogEnv,
  event: string,
  properties: Record<string, unknown> = {}
): Promise<void> {
  await send(env, { event, distinct: ANONYMOUS_ID, properties });
}

/**
 * Envía una excepción a PostHog error tracking. Nunca lanza.
 *
 * `$exception` con `$exception_list` es el formato que espera el producto de
 * error tracking; es lo que el self-driving lee para investigar un fallo de
 * producción y proponer un PR de arreglo.
 */
export async function captureException(
  env: PosthogEnv,
  error: unknown,
  opts: {
    component: string;
    stage?: string;
    platform?: string;
    id?: unknown;
    context?: Record<string, unknown>;
  }
): Promise<void> {
  const err = error instanceof Error ? error : new Error(String(error));
  const did =
    opts.platform !== undefined ? distinctId(opts.platform, opts.id) : null;
  await send(env, {
    event: "$exception",
    distinct: did ?? ANONYMOUS_ID,
    properties: {
      ...(opts.context ?? {}),
      component: opts.component,
      stage: opts.stage,
      $exception_list: [
        {
          type: err.name,
          value: err.message,
          mechanism: { handled: true, synthesized: false },
          stacktrace: { frames: [], type: "raw" },
        },
      ],
    },
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// LLM observability ($ai_generation)
// ─────────────────────────────────────────────────────────────────────────────
//
// PostHog deriva coste, latencia y tasa de error de los LLM a partir de un único
// evento `$ai_generation` con propiedades `$ai_*`. No hay que calcular nada: si
// el evento lleva modelo y tokens, PostHog pone el precio. Por eso conviene
// emitirlo desde el envoltorio y no a mano en cada llamada.
//
// Nota: hoy fenrir-bridge NO hace ninguna llamada a un LLM (verificado por
// búsqueda: cero referencias a dashscope/openai/anthropic/completions). Este
// envoltorio queda listo para el momento en que el bot incorpore un modelo, y
// es el mismo contrato que usan los bots de ClipsFlow y Marina en HostCasa.

export type AiGenerationInput = {
  /** Agrupa todas las llamadas de una misma conversación en una traza. */
  traceId: string;
  model: string;
  provider: string;
  /** Mensajes de entrada, ya recortados/redactados por el llamador. */
  input?: unknown;
  spanName?: string;
  platform?: string;
  id?: unknown;
  properties?: Record<string, unknown>;
};

/**
 * Envuelve una llamada a un LLM y emite `$ai_generation` pase lo que pase.
 *
 * Mide latencia, propaga el resultado sin tocarlo y en caso de excepción emite
 * el evento con `$ai_is_error` antes de re-lanzar. El error se re-lanza a
 * propósito: la observabilidad no cambia el comportamiento del bot, sólo lo
 * observa.
 */
export async function withAiGeneration<T>(
  env: PosthogEnv,
  input: AiGenerationInput,
  call: () => Promise<T>,
  extract?: (result: T) => {
    output?: unknown;
    inputTokens?: number;
    outputTokens?: number;
    httpStatus?: number;
  }
): Promise<T> {
  const startedAt = Date.now();
  try {
    const result = await call();
    const meta = extract ? extract(result) : {};
    await captureAiGeneration(env, input, {
      latencySeconds: (Date.now() - startedAt) / 1000,
      output: meta.output,
      inputTokens: meta.inputTokens,
      outputTokens: meta.outputTokens,
      httpStatus: meta.httpStatus ?? 200,
      isError: false,
    });
    return result;
  } catch (error) {
    await captureAiGeneration(env, input, {
      latencySeconds: (Date.now() - startedAt) / 1000,
      isError: true,
      error: error instanceof Error ? error.message : String(error),
    });
    throw error; // la observabilidad observa, no altera
  }
}

async function captureAiGeneration(
  env: PosthogEnv,
  input: AiGenerationInput,
  outcome: {
    latencySeconds: number;
    output?: unknown;
    inputTokens?: number;
    outputTokens?: number;
    httpStatus?: number;
    isError: boolean;
    error?: string;
  }
): Promise<void> {
  const did = distinctId(input.platform ?? "telegram", input.id);
  await send(env, {
    event: "$ai_generation",
    distinct: did ?? ANONYMOUS_ID,
    properties: {
      ...(input.properties ?? {}),
      $ai_trace_id: input.traceId,
      $ai_span_name: input.spanName,
      $ai_model: input.model,
      $ai_provider: input.provider,
      $ai_input: input.input,
      $ai_output_choices: outcome.output,
      $ai_input_tokens: outcome.inputTokens,
      $ai_output_tokens: outcome.outputTokens,
      $ai_latency: outcome.latencySeconds,
      $ai_http_status: outcome.httpStatus,
      $ai_is_error: outcome.isError,
      $ai_error: outcome.error,
    },
  });
}

/**
 * Envuelve el handler de una Pages Function para que ninguna excepción se
 * escape sin registrarse.
 *
 * En el runtime de Workers NO existen `process.on("uncaughtException")` ni
 * `unhandledRejection` — son APIs de Node. El equivalente correcto aquí es
 * envolver el handler, que además da algo que Node no da: la petición que lo
 * provocó. La excepción se re-lanza para que Cloudflare la registre también.
 */
export function withErrorTracking<
  C extends { request: Request; env: PosthogEnv }
>(component: string, handler: (context: C) => Promise<Response>) {
  return async (context: C): Promise<Response> => {
    try {
      return await handler(context);
    } catch (error) {
      const url = new URL(context.request.url);
      await captureException(context.env, error, {
        component,
        stage: "request",
        context: { path: url.pathname, method: context.request.method },
      });
      throw error;
    }
  };
}

/**
 * Lee un feature flag en el borde. Devuelve `fallback` ante cualquier fallo:
 * una caída de PostHog no puede abrir ni cerrar una puerta del producto —
 * y en Fenrir las puertas son de acceso y de pago.
 */
export async function isFeatureEnabled(
  env: PosthogEnv,
  flag: string,
  platform: string,
  id: unknown,
  fallback = false
): Promise<boolean> {
  const token = env.POSTHOG_PROJECT_TOKEN?.trim();
  if (!token) return fallback;
  const did = distinctId(platform, id);
  if (did === null) return fallback;
  const host = env.POSTHOG_HOST?.trim() || DEFAULT_HOST;
  try {
    const res = await fetch(`${host.replace(/\/$/, "")}/flags/?v=2`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ api_key: token, distinct_id: did }),
    });
    if (!res.ok) return fallback;
    const data = (await res.json()) as { flags?: Record<string, { enabled?: boolean }> };
    const entry = data?.flags?.[flag];
    return entry?.enabled === undefined ? fallback : Boolean(entry.enabled);
  } catch {
    return fallback;
  }
}
