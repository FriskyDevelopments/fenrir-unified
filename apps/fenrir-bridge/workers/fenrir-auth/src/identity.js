// Session identity for fenrir-auth-worker.
//
// Persistent users/sessions prefer Neon when DATABASE_URL (or NEON_DATABASE_URL)
// is healthy. Login must still mint KV sessions when Neon is absent or down —
// deploying Neon-only createSession would 500 the OAuth callback.
import { cfg } from "./config.js";
import * as neon from "./neon.js";
import * as kv from "./session.js";

function hasDatabase(env) {
  return Boolean(cfg(env).databaseUrl);
}

function hasKv(env) {
  return Boolean(env?.SESSIONS);
}

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
