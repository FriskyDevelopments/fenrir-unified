import { createFileRoute } from "@tanstack/react-router";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { neonSql } from "@/lib/neon.server";

const destinationInput = z
  .object({
    telegramUserId: z.coerce.number().int().positive().max(9_999_999_999_999),
    communityId: z
      .string()
      .trim()
      .toLowerCase()
      .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/),
    telegramChatId: z.string().trim().regex(/^-100\d{6,20}$/),
    displayName: z.string().trim().min(1).max(120),
    capabilities: z
      .object({ botAdmin: z.literal(true), canInviteUsers: z.literal(true) })
      .strict(),
  })
  .strict();

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function sameSecret(left: string, right: string): boolean {
  if (!left || left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) {
    difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  }
  return difference === 0;
}

/**
 * Bot-only ingress for a Telegram group that Fenrir has just verified. The
 * endpoint resolves the Telegram identity to the MyFenrir user itself; callers
 * cannot nominate an arbitrary owner or insert an unverified destination.
 */
async function syncTelegramDestination(request: Request): Promise<Response> {
  const expectedSecret = process.env["COMMUNITY_BRIDGE_DESTINATION_SYNC_SECRET"]?.trim();
  const suppliedSecret = (request.headers.get("authorization") ?? "").replace(/^Bearer\s+/i, "").trim();
  if (!expectedSecret || !sameSecret(expectedSecret, suppliedSecret)) {
    return json({ ok: false, error: "unauthorized" }, 401);
  }

  const parsed = destinationInput.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return json({ ok: false, error: "invalid_destination" }, 400);
  const data = parsed.data;

  const { data: identity, error: identityError } = await supabaseAdmin
    .from("account_links")
    .select("supabase_user_id")
    .eq("provider", "telegram")
    .eq("status", "linked")
    .eq("telegram_id", data.telegramUserId)
    .maybeSingle();
  if (identityError) {
    console.error("telegram_destination_identity_lookup_failed", identityError.message);
    return json({ ok: false, error: "identity_lookup_failed" }, 503);
  }
  if (!identity?.supabase_user_id) {
    return json({ ok: false, error: "telegram_identity_not_linked" }, 409);
  }

  try {
    const sql = neonSql();
    const capabilities = JSON.stringify(data.capabilities);
    const metadata = JSON.stringify({ telegram_chat_id: data.telegramChatId, synced_by: "fenrir-bot" });
    await sql`
      insert into cb_community_destinations (
        user_id, community_id, provider, adapter_version, setup_mode, external_id,
        display_name, status, capabilities, metadata, verified_at
      ) values (
        ${identity.supabase_user_id}, ${data.communityId}, 'telegram', 'v1', 'bot_admin',
        ${data.telegramChatId}, ${data.displayName}, 'verified', ${capabilities}::jsonb,
        ${metadata}::jsonb, now()
      )
      on conflict (user_id, community_id, provider, external_id) do update set
        display_name = excluded.display_name,
        status = 'verified',
        capabilities = excluded.capabilities,
        metadata = excluded.metadata,
        verified_at = now(),
        updated_at = now()
    `;
    return json({ ok: true, communityId: data.communityId });
  } catch (error) {
    console.error("telegram_destination_sync_failed", error);
    return json({ ok: false, error: "destination_sync_failed" }, 503);
  }
}

export const Route = createFileRoute("/api/internal/telegram-destination")({
  server: { handlers: { POST: ({ request }) => syncTelegramDestination(request) } },
});
