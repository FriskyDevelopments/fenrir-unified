import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "get_my_account",
  title: "Get my MyFenrir account",
  description:
    "Return the signed-in user's MyFenrir account: user id, email, portal role, and linked Telegram ID.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("user_roles")
      .select("role, telegram_id")
      .eq("user_id", ctx.getUserId())
      .maybeSingle();
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const account = {
      user_id: ctx.getUserId(),
      email: ctx.getUserEmail() ?? null,
      role: (data?.role as string | undefined) ?? "user",
      telegram_id: data?.telegram_id ? String(data.telegram_id) : null,
      telegram_linked: Boolean(data?.telegram_id),
    };
    return {
      content: [{ type: "text", text: JSON.stringify(account, null, 2) }],
      structuredContent: account,
    };
  },
});
