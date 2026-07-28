/**
 * PostHog en el navegador para MyFenrir (fenrir-bridge).
 *
 * Convive con `installHoneybadgerBrowserReporter()`: Honeybadger sigue siendo
 * el reporte de errores existente y no se toca. PostHog añade lo que
 * Honeybadger no da — embudos de producto, session replay y feature flags —
 * y su error tracking es además lo que alimenta al self-driving de PostHog.
 *
 * **Inerte sin llave.** Si `VITE_POSTHOG_PROJECT_TOKEN` no está definida no se
 * inicializa nada y la app corre igual. Ruidoso en desarrollo, silencioso en
 * producción: un despliegue mal configurado se descubre en la laptop, no como
 * un mes de eventos perdidos.
 *
 * La llave `phc_` es pública (sólo puede escribir eventos) pero se lee sólo del
 * entorno de build: el repo no lleva ninguna credencial embebida.
 */

import posthog from "posthog-js";

const TOKEN = import.meta.env.VITE_POSTHOG_PROJECT_TOKEN as string | undefined;
const HOST =
  (import.meta.env.VITE_POSTHOG_HOST as string | undefined) ??
  "https://us.i.posthog.com";

let started = false;

export function installPosthog(): void {
  if (started || typeof window === "undefined") return;

  if (!TOKEN) {
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.error(
        "VITE_POSTHOG_PROJECT_TOKEN variable required by PostHog is missing or " +
          "un-configured, this causes events to be silently missed. This error " +
          "stops appearing once VITE_POSTHOG_PROJECT_TOKEN is configured"
      );
    }
    return;
  }

  started = true;
  try {
    posthog.init(TOKEN, {
      api_host: HOST,
      person_profiles: "identified_only",
      capture_pageview: true,
      capture_pageleave: true,
      // MyFenrir arrastra un problema conocido de bucle de login. Un bucle no
      // deja excepción ni log: sólo se ve mirando la sesión de alguien que lo
      // sufre. Por eso el replay aquí no es un extra, es el diagnóstico.
      disable_session_recording: false,
      session_recording: {
        // Login, tokens de sesión y datos de pago pasan por esta UI. Todo input
        // enmascarado por defecto: una repetición no puede filtrar nada.
        maskAllInputs: true,
        maskTextSelector: "[data-ph-mask]",
      },
      capture_exceptions: true,
      autocapture: true,
    });
    posthog.register({ service: "myfenrir-web" });
    detectLoginLoop();
  } catch {
    // La analítica nunca puede impedir que la app arranque.
    started = false;
  }
}

/**
 * Detector pasivo del bucle de login de MyFenrir.
 *
 * El bucle es el fallo conocido más caro de este producto y el más difícil de
 * ver: no lanza excepción, no deja log de error y el servidor responde 200 en
 * cada vuelta. Lo único observable es que la misma sesión vuelve a aterrizar en
 * la pantalla de login una y otra vez sin llegar nunca a `/main`.
 *
 * Esto sólo *observa* la navegación —cuenta aterrizajes en el login dentro de
 * la misma sesión de pestaña— y emite un evento al pasar de 3. No toca ni lee
 * nada de autenticación, así que no puede alterar el propio flujo que mide.
 */
function detectLoginLoop(): void {
  try {
    const path = window.location.pathname;
    const KEY = "ph_login_landings";

    if (path === "/main" || path.startsWith("/main/")) {
      // Llegó al destino: el intento tuvo éxito, se reinicia la cuenta.
      window.sessionStorage.removeItem(KEY);
      return;
    }
    if (!/login|sign-?in|auth/i.test(path)) return;

    const count = Number(window.sessionStorage.getItem(KEY) ?? "0") + 1;
    window.sessionStorage.setItem(KEY, String(count));

    if (count === 1) {
      track(EVENTS.LOGIN_STARTED, { path });
      return;
    }
    // Volver una vez puede ser el usuario. Tres veces sin llegar a /main es
    // el bucle: el umbral está aquí, no en el consumidor del evento, para que
    // el evento en sí ya sea la señal y no haya que reconstruirla en PostHog.
    if (count >= 3) {
      track(EVENTS.LOGIN_LOOP_DETECTED, { path, landings: count });
    }
  } catch {
    // sessionStorage puede estar bloqueado (modo privado, iframe). No importa.
  }
}

/** Captura un evento de producto. No-op sin PostHog. Nunca lanza. */
export function track(event: string, properties: Record<string, unknown> = {}): void {
  if (!started) return;
  try {
    posthog.capture(event, properties);
  } catch {
    /* no-op */
  }
}

/**
 * Liga la sesión a una persona. El distinct_id debe tener la misma forma que
 * en el borde (`functions/_lib/posthog.ts`) y en los demás productos Frisky:
 * `"telegram:<id>"` o el user id de Supabase.
 */
export function identify(distinct: string, traits: Record<string, unknown> = {}): void {
  if (!started || !distinct) return;
  try {
    posthog.identify(distinct, traits);
  } catch {
    /* no-op */
  }
}

/**
 * Cierra la identidad al salir. Sin esto, la siguiente persona que use el
 * navegador hereda la identidad de la anterior y los embudos quedan mezclados.
 */
export function resetIdentity(): void {
  if (!started) return;
  try {
    posthog.reset();
  } catch {
    /* no-op */
  }
}

/**
 * Lee un feature flag. Devuelve `fallback` ante cualquier fallo: en Fenrir las
 * puertas que estos flags controlan son de acceso y de pago, así que una caída
 * de PostHog no puede abrirlas ni cerrarlas.
 */
export function flag(name: string, fallback = false): boolean {
  if (!started) return fallback;
  try {
    const value = posthog.isFeatureEnabled(name);
    return value === undefined || value === null ? fallback : Boolean(value);
  } catch {
    return fallback;
  }
}

/** Variante de un experimento A/B. Devuelve `fallback` ante cualquier fallo. */
export function variant(name: string, fallback = "control"): string {
  if (!started) return fallback;
  try {
    const value = posthog.getFeatureFlag(name);
    if (value === undefined || value === null || value === false) return fallback;
    return String(value);
  } catch {
    return fallback;
  }
}

/** Nombres de eventos de MyFenrir. Un solo sitio, para que no se separen. */
export const EVENTS = {
  LOGIN_STARTED: "login_started",
  LOGIN_SUCCEEDED: "login_succeeded",
  LOGIN_FAILED: "login_failed",
  LOGIN_LOOP_DETECTED: "login_loop_detected",
  COMMUNITY_GATE_SHOWN: "community_gate_shown",
  COMMUNITY_JOIN_REQUESTED: "community_join_requested",
  CHECKOUT_STARTED: "checkout_started",
  PAYMENT_COMPLETED: "payment_completed",
  SUBSCRIPTION_VIEWED: "subscription_viewed",
} as const;

/** Feature flags conocidos de MyFenrir. */
export const FLAGS = {
  /** Kill-switch del nuevo flujo de login sin redeploy. */
  LOGIN_V2: "myfenrir-login-v2",
  /** Experimento A/B del copy de la puerta de comunidad. */
  GATE_COPY: "myfenrir-gate-copy",
} as const;
