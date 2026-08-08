import { auth, defineMcp } from "@lovable.dev/mcp-js";
import { CANONICAL_SUPABASE_PROJECT_REF } from "../../integrations/supabase/client";
import getMyAccountTool from "./tools/get-my-account";
import linkTelegramAccountTool from "./tools/link-telegram-account";
import listPortalUsersTool from "./tools/list-portal-users";

const projectRef = import.meta.env.VITE_SUPABASE_PROJECT_ID ?? CANONICAL_SUPABASE_PROJECT_REF;

export default defineMcp({
  name: "myfenrir-access-control",
  title: "MyFenrir Access Control",
  version: "0.1.0",
  instructions:
    "Tools for the MyFenrir portal. Use `get_my_account` to read the signed-in user's role and Telegram link status, `link_telegram_account` to redeem a bot code, and `list_portal_users` to list portal users (staff only).",
  auth: auth.oauth.issuer({
    issuer: `https://${projectRef}.supabase.co/auth/v1`,
    acceptedAudiences: "authenticated",
  }),
  tools: [getMyAccountTool, linkTelegramAccountTool, listPortalUsersTool],
});
