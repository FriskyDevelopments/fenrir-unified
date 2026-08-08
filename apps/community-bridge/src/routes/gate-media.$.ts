import { createFileRoute } from "@tanstack/react-router";

/**
 * Serves gate artwork uploads (logo / mascot / background — images, GIFs, MP4).
 *
 * The `gate-media` bucket is private (public buckets are disabled for this
 * workspace), so files are streamed through this public read-only route.
 * Only GET is exposed and nothing but the object bytes is returned.
 */
export const Route = createFileRoute("/gate-media/$")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const raw = (params as { _splat?: string })._splat ?? "";
        const path = decodeURIComponent(raw);

        if (!path || path.includes("..") || !/^[A-Za-z0-9/_.-]{1,200}$/.test(path)) {
          return new Response("Not found", { status: 404 });
        }

        const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
        const { data, error } = await supabaseAdmin.storage.from("gate-media").download(path);
        if (error || !data) return new Response("Not found", { status: 404 });

        return new Response(await data.arrayBuffer(), {
          headers: {
            "content-type": data.type || "application/octet-stream",
            "cache-control": "public, max-age=3600, stale-while-revalidate=86400",
          },
        });
      },
    },
  },
});
