import { defineTool } from "@lovable.dev/mcp-js";
import { z } from "zod";
import { supabaseForUser } from "../supabase";

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
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase.rpc("redeem_telegram_link_code", {
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
