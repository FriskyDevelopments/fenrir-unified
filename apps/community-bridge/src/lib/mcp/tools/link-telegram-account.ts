import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

// The 6-char client-redeemed code (redeem_telegram_link_code / telegram_link_codes)
// is GONE. Linking is completed by the Telegram bot over the deep-link
// t.me/<bot>?start=link_<code>, and the ONLY writer is MyFenrir's
// POST /api/telegram/link/confirm, which upserts public.account_links.
//
// This tool now just reports the canonical link status (from account_links) and
// points the user at the dashboard's "Link Telegram" action, which mints the
// deep-link. It no longer calls any orphaned RPC.
export default defineTool({
  name: "link_telegram_account",
  title: "Link Telegram account",
  description:
    "Check whether your Telegram is linked (canonical account_links) and get the instructions to finish linking via the MyFenrir bot deep-link.",
  inputSchema: {},
  annotations: { readOnlyHint: true, destructiveHint: false, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("account_links")
      .select("telegram_id, status")
      .eq("provider", "telegram")
      .eq("status", "linked")
      .maybeSingle(); // RLS → own row only

    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const linked = Boolean(data?.telegram_id);
    const text = linked
      ? `Telegram is already linked (telegram_id ${data!.telegram_id}).`
      : "Telegram is not linked yet. Open MyFenrir → Dashboard → “Link Telegram” to get your one-time bot link, then press Start in the MyFenrir bot. The bot finishes the link automatically.";

    return {
      content: [{ type: "text", text }],
      structuredContent: {
        linked,
        telegram_id: data?.telegram_id ? String(data.telegram_id) : null,
      },
    };
  },
});
