/**
 * Fenrir Protocol — master account resolution.
 *
 * THE master identity for every Frisky product is the Supabase `auth.users.id`
 * UUID in the FriskyDEV project (ref `yqevglppbhuoxxfsfnih`). Every front-end
 * (WorkOS/AuthKit web login, direct OAuth, Telegram OTP, passkey) is only an
 * *authentication channel*; after it proves a verified email, that email is
 * resolved here to the one canonical account UUID — the `frisky_account_id`.
 *
 * This is what makes "one login works across products" true: a human who signs
 * in on the web via WorkOS and the same human who links Telegram via the bot
 * both collapse onto the same `auth.users` row, because email is the join key.
 *
 * Requires the same env the profile store already uses — no new secrets:
 *   SUPABASE_URL                (e.g. https://yqevglppbhuoxxfsfnih.supabase.co)
 *   SUPABASE_SERVICE_ROLE_KEY   (service role; admin auth API)
 */

export type SupabaseAdminEnv = {
  SUPABASE_URL?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export type FriskyAccount = {
  /** Canonical master id — the Supabase auth.users UUID. */
  id: string;
  email: string;
};

function adminConfigured(env: SupabaseAdminEnv) {
  return Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

function adminHeaders(env: SupabaseAdminEnv) {
  const key = env.SUPABASE_SERVICE_ROLE_KEY!;
  return {
    apikey: key,
    Authorization: `Bearer ${key}`,
    'Content-Type': 'application/json',
  };
}

/**
 * Look up an existing Supabase auth user by email. Returns null if absent or if
 * the admin API is not configured. Read-only.
 */
export async function getAccountByEmail(
  env: SupabaseAdminEnv,
  email: string
): Promise<FriskyAccount | null> {
  if (!adminConfigured(env)) return null;
  const base = env.SUPABASE_URL!.replace(/\/$/, '');
  const normalized = email.trim().toLowerCase();
  const response = await fetch(
    `${base}/auth/v1/admin/users?email=${encodeURIComponent(normalized)}`,
    { headers: adminHeaders(env) }
  ).catch(() => null);
  if (!response || !response.ok) return null;
  const data = (await response.json().catch(() => null)) as {
    users?: Array<{ id?: string; email?: string }>;
  } | null;
  // SECURITY: match ONLY on an exact (case-insensitive) email. Some GoTrue
  // versions ignore the `?email=` filter and return the full, paginated user
  // list — in that case a `?? users[0]` fallback would silently collapse a
  // brand-new email onto whatever arbitrary account happens to be first,
  // cross-wiring two humans onto one master identity. Never guess: if no row
  // matches the exact email, treat it as "no account" so the caller creates one.
  const user = data?.users?.find((u) => (u.email ?? '').trim().toLowerCase() === normalized);
  if (!user?.id) return null;
  return { id: user.id, email: (user.email ?? normalized).trim().toLowerCase() };
}

/**
 * Resolve a verified email to its canonical Frisky account UUID, creating the
 * Supabase auth user if it does not exist yet (email-confirmed, since the
 * calling front-end already verified ownership of the address).
 *
 * Returns null only when the admin API is unconfigured — callers should then
 * fall back to the legacy synthetic id and continue (never block login on it).
 */
export async function resolveFriskyAccountId(
  env: SupabaseAdminEnv,
  email: string
): Promise<string | null> {
  if (!adminConfigured(env)) return null;
  const normalized = email.trim().toLowerCase();

  const existing = await getAccountByEmail(env, normalized);
  if (existing) return existing.id;

  const base = env.SUPABASE_URL!.replace(/\/$/, '');
  const response = await fetch(`${base}/auth/v1/admin/users`, {
    method: 'POST',
    headers: adminHeaders(env),
    // email_confirm:true — the front-end (WorkOS/OAuth/Telegram HMAC) already
    // proved control of the address, so we don't re-send a confirmation mail.
    body: JSON.stringify({ email: normalized, email_confirm: true }),
  }).catch(() => null);

  if (response && response.ok) {
    const created = (await response.json().catch(() => null)) as { id?: string } | null;
    if (created?.id) return created.id;
  }

  // Lost a create race (duplicate email) or transient error — re-read.
  const after = await getAccountByEmail(env, normalized);
  return after?.id ?? null;
}
