import { defineTool } from "@lovable.dev/mcp-js";
import { supabaseForUser } from "../supabase";

export default defineTool({
  name: "list_portal_users",
  title: "List portal users",
  description:
    "List MyFenrir portal users with their roles and linked Telegram IDs. Only staff (admin or owner) can read more than their own record.",
  inputSchema: {},
  annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
  handler: async (_input, ctx) => {
    if (!ctx.isAuthenticated()) {
      return { content: [{ type: "text", text: "Not authenticated" }], isError: true };
    }
    const supabase = supabaseForUser(ctx);
    const { data, error } = await supabase
      .from("user_roles")
      .select("user_id, role, telegram_id, created_at")
      .order("created_at", { ascending: true });
    if (error) return { content: [{ type: "text", text: error.message }], isError: true };

    const users = (data ?? []).map((row) => ({
      user_id: row.user_id as string,
      role: row.role as string,
      telegram_id: row.telegram_id ? String(row.telegram_id) : null,
      created_at: row.created_at as string,
    }));
    return {
      content: [{ type: "text", text: JSON.stringify(users, null, 2) }],
      structuredContent: { users, count: users.length },
    };
  },
});
