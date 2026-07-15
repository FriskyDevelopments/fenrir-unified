import type { BillingEnv } from './billing-env';
import type { SessionPayload } from './auth';

export type ProfilePatch = {
  display_name?: string;
  locale?: string;
  preferred_billing?: 'telegram_stars' | 'stripe';
  notify_billing?: boolean;
  notify_security?: boolean;
  workspace_name?: string;
};

function serviceConfigured(env: BillingEnv) {
  return Boolean(env.SUPABASE_URL?.trim() && env.SUPABASE_SERVICE_ROLE_KEY?.trim());
}

export async function upsertProfileForSession(
  env: BillingEnv,
  session: SessionPayload,
  supabaseUserId: string
) {
  if (!serviceConfigured(env)) return;
  const url = env.SUPABASE_URL!.replace(/\/$/, '');
  const body = {
    id: supabaseUserId,
    email: session.email,
    display_name: session.name,
    workspace_name: `${session.name}'s Fenrir`,
    updated_at: new Date().toISOString(),
  };
  await fetch(`${url}/rest/v1/profiles`, {
    method: 'POST',
    headers: {
      apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
      Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      'Content-Type': 'application/json',
      Prefer: 'resolution=merge-duplicates',
    },
    body: JSON.stringify(body),
  }).catch(() => null);
}

export async function fetchProfileByUserId(env: BillingEnv, supabaseUserId: string) {
  if (!serviceConfigured(env)) return null;
  const url = env.SUPABASE_URL!.replace(/\/$/, '');
  const response = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(supabaseUserId)}&select=id,email,display_name,locale,preferred_billing,notify_billing,notify_security,workspace_name,updated_at`,
    {
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
      },
    }
  );
  if (!response.ok) return null;
  const rows = await response.json<Record<string, unknown>[]>();
  return rows[0] ?? null;
}

export async function patchProfileByUserId(
  env: BillingEnv,
  supabaseUserId: string,
  patch: ProfilePatch
) {
  if (!serviceConfigured(env))
    return { ok: false as const, error: 'supabase_service_not_configured' };
  const url = env.SUPABASE_URL!.replace(/\/$/, '');
  const body: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (patch.display_name !== undefined) body.display_name = patch.display_name;
  if (patch.locale !== undefined) body.locale = patch.locale;
  if (patch.preferred_billing !== undefined) body.preferred_billing = patch.preferred_billing;
  if (patch.notify_billing !== undefined) body.notify_billing = patch.notify_billing ? 1 : 0;
  if (patch.notify_security !== undefined) body.notify_security = patch.notify_security ? 1 : 0;
  if (patch.workspace_name !== undefined) body.workspace_name = patch.workspace_name;

  const response = await fetch(
    `${url}/rest/v1/profiles?id=eq.${encodeURIComponent(supabaseUserId)}`,
    {
      method: 'PATCH',
      headers: {
        apikey: env.SUPABASE_SERVICE_ROLE_KEY!,
        Authorization: `Bearer ${env.SUPABASE_SERVICE_ROLE_KEY}`,
        'Content-Type': 'application/json',
        Prefer: 'return=representation',
      },
      body: JSON.stringify(body),
    }
  );
  if (!response.ok) return { ok: false as const, error: 'profile_update_failed' };
  const rows = await response.json<Record<string, unknown>[]>();
  return { ok: true as const, profile: rows[0] ?? null };
}
