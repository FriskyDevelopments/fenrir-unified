// Session identity for fenrir-auth-worker.
//
// Persistent users/sessions prefer Neon when DATABASE_URL (or NEON_DATABASE_URL)
// is healthy. Login must still mint KV sessions when Neon is absent or down —
// deploying Neon-only createSession would 500 the OAuth callback.
import { cfg } from "./config.js";
import * as neon from "./neon.js";
import * as kv from "./session.js";

/**
 * Determines whether a database URL is configured.
 * @param {Object} env - The environment configuration.
 * @return {boolean} `true` if a database URL is configured, `false` otherwise.
 */
function hasDatabase(env) {
  return Boolean(cfg(env).databaseUrl);
}

/**
 * Determines whether a KV session store is configured.
 * @param {object} env - The environment containing the session store binding.
 * @return {boolean} `true` if a KV session store is configured, `false` otherwise.
 */
function hasKv(env) {
  return Boolean(env?.SESSIONS);
}

/**
 * Creates a session using the configured Neon database or KV store.
 * @param {object} user - The user associated with the session.
 * @param {object} meta - Additional session metadata.
 * @returns {Promise<*>} The created session.
 * @throws {Error} Throws `session_store_unavailable` when no session store is available.
 */
export async function createSession(env, user, meta = {}) {
  if (hasDatabase(env)) {
    try {
      return await neon.createSession(env, user, meta);
    } catch {
      /* fall through to KV so a Neon outage does not block login */
    }
  }
  if (!hasKv(env)) throw new Error("session_store_unavailable");
  return kv.createSession(env, user);
}

/**
 * Retrieves a session using the configured Neon store or KV fallback.
 * @param {Object} env - The runtime environment containing session store configuration.
 * @param {Request} request - The request containing the session identifier.
 * @returns {Object|null} The session record, or `null` when no session store is available or no session is found.
 */
export async function getSession(env, request) {
  if (hasDatabase(env)) {
    try {
      const row = await neon.getSession(env, request);
      if (row) return row;
    } catch {
      /* try KV for sessions minted before/during cutover */
    }
  }
  if (!hasKv(env)) return null;
  const row = await kv.getSession(env, request);
  if (row?.user && hasDatabase(env)) {
    try {
      await neon.upsertUser(env, row.user);
    } catch {
      /* session remains valid; later Neon writes can catch up */
    }
  }
  return row;
}

/**
 * Destroys the session across the configured session stores.
 * @param {object} env - The environment containing session store configuration.
 * @param {Request} request - The request associated with the session.
 * @return {string|Response|null} The session-clearing cookie or result.
 */
export async function destroySession(env, request) {
  let cookie = null;
  if (hasDatabase(env)) {
    try {
      cookie = await neon.destroySession(env, request);
    } catch {
      /* still clear KV + cookie */
    }
  }
  if (hasKv(env)) {
    cookie = await kv.destroySession(env, request);
  }
  if (cookie) return cookie;
  return kv.destroySession(env, request);
}
