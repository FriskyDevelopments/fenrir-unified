import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { resolveActiveGateInvite } from "@/lib/gate-invites.functions";

export const Route = createFileRoute("/invite/$token")({
  server: { handlers: { GET: async ({ params }) => openInvite(params.token) } },
});

async function openInvite(token: string): Promise<Response> {
  const invite = await resolveActiveGateInvite(token);
  if (!invite) return new Response("This community invite is no longer active.", { status: 410, headers: { "Cache-Control": "no-store" } });
  const bot = process.env["VITE_TELEGRAM_BOT_USERNAME"]?.trim() || "MyfenrirprotocolDEVbot";
  return new Response(null, { status: 302, headers: { Location: `https://t.me/${bot}?start=gate_${encodeURIComponent(invite.slug)}`, "Cache-Control": "no-store" } });
}
