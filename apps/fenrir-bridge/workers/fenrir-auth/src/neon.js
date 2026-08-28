// Neon-backed identity + sessions for fenrir-auth-worker.
// HMAC cookie contract matches folios-auth-worker: <sessionId>.<hmac(sessionId)>.
import { neon } from "@neondatabase/serverless";
import { cfg } from "./config.js";
import { randomToken, signValue, verifySignedValue } from "./crypto.js";
import { emptySessionCookie, parseCookies, serializeCookie } from "./session.js";

/**
 * Resolves the database connection URL from configured settings or Hyperdrive.
 * @param {Object} env - The environment containing database configuration and optional Hyperdrive settings.
 * @return {string} The database connection URL, or an empty string when none is configured.
 */
function databaseUrl(env) {
  return cfg(env).databaseUrl || (env.HYPERDRIVE && env.HYPERDRIVE.connectionString) || "";
}

/**
 * Creates a database query client from the configured database URL.
 * @param {object} env - Environment containing the database configuration.
 * @returns {Function} A Neon database query function.
 * @throws {Error} If the database URL is not configured.
 */
function db(env) {
  const url = databaseUrl(env);
  if (!url) throw new Error("DATABASE_URL not set");
  // neon() is a tagged-template query fn. Create per call so this isolate never
  // reuses a connection string from a different env object.
  return neon(url);
}

export function getDb(env) {
  return db(env);
}

/**
 * Checks whether the configured database is available.
 * @param {object} env - The environment containing the database configuration.
 * @return {{ok: boolean, error?: string}} The database status, including an error code when configuration is missing or the database is unreachable.
 */
export async function checkDatabase(env) {
  if (!databaseUrl(env)) return { ok: false, error: "DATABASE_URL_missing" };
  try {
    const rows = await db(env)`select 1 as ok`;
    return { ok: rows[0]?.ok === 1 };
  } catch {
    return { ok: false, error: "database_unreachable" };
  }
}

/**
 * Extracts bearer credentials from an HTTP authorization header.
 * @param {Request} request - The request containing the authorization header.
 * @return {string|null} The trimmed bearer token, or `null` when the header does not contain bearer credentials.
 */
function bearerToken(request) {
  const header = request.headers.get("Authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7).trim() : null;
}

/**
 * Creates or updates a user record and refreshes its last-login timestamp.
 * @param {Object} user - The user identity and profile data to persist.
 * @returns {Object} The persisted user fields.
 */
export async function upsertUser(env, user) {
  const sql = db(env);
  const rows = await sql`
    insert into users (id, provider, sub, email, email_verified, name, picture, last_login_at)
    values (${user.id}, ${user.provider}, ${user.sub}, ${user.email ?? null},
            ${user.email_verified ?? null}, ${user.name ?? null}, ${user.picture ?? null}, now())
    on conflict (id) do update set
      email          = excluded.email,
      email_verified = excluded.email_verified,
      name           = coalesce(excluded.name, users.name),
      picture        = coalesce(excluded.picture, users.picture),
      last_login_at  = now()
    returning id, provider, sub, email, email_verified, name, picture
  `;
  return rows[0];
}

/**
 * Creates a persistent authenticated session for a user.
 * @param {Object} user - The user identity to associate with the session.
 * @param {Object} [meta] - Optional request metadata, such as the user agent and IP address.
 * @returns {Promise<Object>} The session identifier, signed token, serialized cookie, and session record.
 */
export async function createSession(env, user, meta = {}) {
  const c = cfg(env);
  const sql = db(env);

  await upsertUser(env, user);

  const sessionId = randomToken(32);
  const ttlMs = c.sessionTtl * 1000;
  const expiresAt = new Date(Date.now() + ttlMs);

  await sql`
    insert into sessions (id, user_id, expires_at, user_agent, ip)
    values (${sessionId}, ${user.id}, ${expiresAt.toISOString()},
            ${meta.userAgent ?? null}, ${meta.ip ?? null})
  `;

  const signed = await signValue(c.sessionSecret, sessionId);
  const cookie = serializeCookie(c.cookieName, signed, {
    domain: c.cookieDomain,
    maxAge: c.sessionTtl,
  });
  return { sessionId, token: signed, cookie, record: { id: sessionId, user, expiresAt: expiresAt.getTime() } };
}

/**
 * Retrieves the authenticated session associated with a bearer token or session cookie.
 * @param {Object} env - The environment containing session and database configuration.
 * @param {Request} request - The request containing the session credential.
 * @returns {Object|null} The session and associated user details, or `null` if the credential is invalid, the session is unavailable, or the session has expired.
 */
export async function getSession(env, request) {
  const c = cfg(env);
  if (!c.sessionSecret) return null;
  const raw = bearerToken(request) || parseCookies(request)[c.cookieName];
  if (!raw) return null;
  const sessionId = await verifySignedValue(c.sessionSecret, raw);
  if (!sessionId) return null;

  const sql = db(env);
  const rows = await sql`
    select s.id, s.created_at, s.expires_at,
           u.id as uid, u.provider, u.sub, u.email, u.email_verified, u.name, u.picture
    from sessions s
    join users u on u.id = s.user_id
    where s.id = ${sessionId}
    limit 1
  `;
  const r = rows[0];
  if (!r) return null;

  const expiresAtMs = new Date(r.expires_at).getTime();
  if (expiresAtMs < Date.now()) {
    await sql`delete from sessions where id = ${sessionId}`;
    return null;
  }
  return {
    id: r.id,
    createdAt: new Date(r.created_at).getTime(),
    expiresAt: expiresAtMs,
    user: {
      id: r.uid,
      provider: r.provider,
      sub: r.sub,
      email: r.email,
      email_verified: r.email_verified,
      name: r.name,
      picture: r.picture,
    },
  };
}

/**
 * Destroys the session associated with the request credential and creates an expired session cookie.
 * @param {Request} request - The request containing a bearer token or session cookie.
 * @return {string} An expired session cookie.
 */
export async function destroySession(env, request) {
  const c = cfg(env);
  const raw = bearerToken(request) || parseCookies(request)[c.cookieName];
  if (raw && c.sessionSecret) {
    const sessionId = await verifySignedValue(c.sessionSecret, raw);
    if (sessionId) {
      try { await db(env)`delete from sessions where id = ${sessionId}`; } catch { /* best-effort */ }
    }
  }
  return emptySessionCookie(env);
}
