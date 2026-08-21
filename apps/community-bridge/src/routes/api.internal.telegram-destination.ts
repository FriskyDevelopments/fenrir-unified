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
    /**
     * Gobierno del grupo, tal y como lo devuelve `getChatAdministrators`.
     * Sirve para dos cosas: saber de quién es el grupo de verdad, y detectar
     * más tarde que el dueño cambió. Opcional a propósito — un alta anterior a
     * este campo sigue siendo válida y no se rompe.
     */
    governance: z
      .object({
        ownerTelegramUserId: z.string().trim().min(1).max(32).nullable(),
        admins: z
          .array(
            z
              .object({
                telegramUserId: z.string().trim().min(1).max(32),
                status: z.enum(["creator", "administrator"]),
                isBot: z.boolean(),
                canInviteUsers: z.boolean(),
                canRestrictMembers: z.boolean(),
                canPromoteMembers: z.boolean(),
              })
              .strict(),
          )
          .max(100),
        mappedAt: z.string().trim().min(1).max(40),
      })
      .strict()
      .optional(),
    /**
     * Resultado del cribado, que llega en una llamada APARTE y posterior. El
     * alta nunca espera a un tercero: si Didit tarda o cae, esto queda
     * `pending` y el grupo se registra igual. Lo que no puede pasar es que un
     * timeout ajeno tumbe el alta.
     */
    screening: z
      .object({
        state: z.enum(["pending", "clear", "blocked", "unavailable"]),
        provider: z.string().trim().max(40),
        checkedAt: z.string().trim().max(40).optional(),
        /** IDs bloqueados. Va al registro interno, NUNCA al chat del grupo. */
        blockedTelegramUserIds: z.array(z.string().trim().max(32)).max(100).optional(),
        reason: z.string().trim().max(200).optional(),
      })
      .strict()
      .optional(),
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
    const metadata = JSON.stringify({
      telegram_chat_id: data.telegramChatId,
      synced_by: "fenrir-bot",
      ...(data.governance ? { governance: data.governance } : {}),
      ...(data.screening ? { screening: data.screening } : {}),
    });
    /*
     * El estado lo DERIVA el servidor del cribado; no lo elige quien llama.
     * Si el bot pudiera mandar `status` directamente, un bot comprometido
     * marcaría cualquier grupo como verificado.
     *
     * `pending` y `unavailable` verifican igual: el cribado es una llamada
     * aparte y posterior, y un tercero caído no puede impedir que alguien
     * registre su grupo. Sólo `blocked` retiene la verificación.
     */
    const status = data.screening?.state === "blocked" ? "blocked" : "verified";
    // `verified_at` sólo se sella cuando de verdad se verificó. Sellarlo en un
    // destino bloqueado sería afirmar algo que no ocurrió.
    const verifiedAt = status === "verified" ? new Date().toISOString() : null;
    await sql`
      insert into cb_community_destinations (
        user_id, community_id, provider, adapter_version, setup_mode, external_id,
        display_name, status, capabilities, metadata, verified_at
      ) values (
        ${identity.supabase_user_id}, ${data.communityId}, 'telegram', 'v1', 'bot_admin',
        ${data.telegramChatId}, ${data.displayName}, ${status}, ${capabilities}::jsonb,
        ${metadata}::jsonb, ${verifiedAt}
      )
      on conflict (user_id, community_id, provider, external_id) do update set
        display_name = excluded.display_name,
        status = excluded.status,
        capabilities = excluded.capabilities,
        metadata = excluded.metadata,
        verified_at = coalesce(${verifiedAt}, cb_community_destinations.verified_at),
        updated_at = now()
    `;
    return json({ ok: true, communityId: data.communityId, status });
  } catch (error) {
    console.error("telegram_destination_sync_failed", error);
    return json({ ok: false, error: "destination_sync_failed" }, 503);
  }
}

export const Route = createFileRoute("/api/internal/telegram-destination")({
  server: { handlers: { POST: ({ request }) => syncTelegramDestination(request) } },
});
