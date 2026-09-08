import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

// Reads the canonical SoT (public.account_links) for the Telegram link, and the
// portal role from user_roles. "linked" now comes from account_links — NOT from
// user_roles.telegram_id and NOT from the orphaned telegram_link_codes path.
export default defineTool({
  name: "get_my_account",
  title: "Get my MyFenrir account",
  description:
    "Return the signed-in user's MyFenrir account: user id, email, portal role, and canonical linked Telegram ID (from account_links).",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);

    const [roleRes, linkRes] = await Promise.all([
      supabase.from("user_roles").select("role").eq("user_id", ctx.getUserId()).maybeSingle(),
      supabase
        .from("account_links")
        .select("telegram_id, status, verified_at")
        .eq("provider", "telegram")
        .eq("status", "linked")
        .maybeSingle(), // RLS restricts to the caller's own row
    ]);

    if (roleRes.error)
      return { content: [{ type: "text", text: roleRes.error.message }], isError: true };
    if (linkRes.error)
      return { content: [{ type: "text", text: linkRes.error.message }], isError: true };

    const link = linkRes.data;
    const account = {
      user_id: ctx.getUserId(),
      email: ctx.getUserEmail() ?? null,
      role: (roleRes.data?.role as string | undefined) ?? "user",
      telegram_id: link?.telegram_id ? String(link.telegram_id) : null,
      telegram_linked: Boolean(link?.telegram_id),
      linked_at: link?.verified_at ?? null,
    };
    return {
      content: [{ type: "text", text: JSON.stringify(account, null, 2) }],
      structuredContent: account,
    };
  },
});
