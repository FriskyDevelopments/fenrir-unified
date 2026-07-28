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
