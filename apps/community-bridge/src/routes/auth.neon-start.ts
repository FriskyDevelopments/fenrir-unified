import { createFileRoute } from "@tanstack/react-router";
import type {} from "@tanstack/react-start";
import { NEON_COMMUNITY_ORIGIN, QUALITY_COMMUNITY_ORIGIN, qualityDestinationPath } from "@/lib/neon-handoff.server";

const PROVIDERS = new Set(["google", "microsoft", "apple"]);

export const Route = createFileRoute("/auth/neon-start")({
  server: { handlers: { GET: async ({ request }) => startNeonSocial(request) } },
});

function startNeonSocial(request: Request): Response {
  const url = new URL(request.url);
  const provider = url.searchParams.get("provider") ?? "";
  if (!PROVIDERS.has(provider)) return Response.redirect("/login?error=unsupported_provider", 302);
  const destinationPath = qualityDestinationPath(url.searchParams.get("destination"));
  const destination = new URL(destinationPath, QUALITY_COMMUNITY_ORIGIN).toString();
  const start = new URL("/api/community-auth/quality-start", NEON_COMMUNITY_ORIGIN);
  start.searchParams.set("provider", provider);
  start.searchParams.set("destination", destination);
  return new Response(null, { status: 302, headers: { Location: start.toString(), "Cache-Control": "no-store" } });
}
