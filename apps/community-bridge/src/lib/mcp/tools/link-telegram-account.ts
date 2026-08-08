import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";

export default defineTool({
  name: "link_telegram_account",
  title: "Link Telegram account",
  description:
    "Redeem a one-time code from the MyFenrir Telegram bot to link that Telegram account to the signed-in portal user.",
  inputSchema: {
    code: z.string().trim().min(1).max(20).describe("The one-time code sent by the MyFenrir bot."),
  },
  annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: false },
  handler: async ({ code }, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    // The redeem RPC lives in the `private` schema (service_role only) and takes
    // the acting user explicitly — same path as the portal's server function.
    const { privateRpc } = await import("@/integrations/supabase/client.server");
    const { data, error } = await privateRpc("redeem_telegram_link_code", {
      _caller: ctx.getUserId(),
      _code: code.toUpperCase(),
    });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };
    const linked = Boolean(data);
    return {
      content: [
        {
          type: "text",
          text: linked
            ? "Telegram account linked successfully."
            : "That code is invalid or has expired.",
        },
      ],
      structuredContent: { linked },
      isError: !linked,
    };
  },
});
