import { createFileRoute } from "@tanstack/react-router";

/**
 * Serves gate artwork uploads (logo / mascot / background — images, GIFs, MP4).
 *
 * Gate artwork is public by design: it appears on shareable `/g/:slug` pages.
 * Keep this compatibility route for already-saved `/gate-media/...` values,
 * but redirect reads to Supabase Storage's public object endpoint. Uploads and
 * mutations remain owner-scoped by RLS on `storage.objects`.
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

        const supabaseUrl =
          process.env["SUPABASE_URL"] ?? process.env["VITE_SUPABASE_URL"];
        if (!supabaseUrl) return new Response("Media service unavailable", { status: 503 });

        const objectUrl = new URL(
          `/storage/v1/object/public/gate-media/${path.split("/").map(encodeURIComponent).join("/")}`,
          supabaseUrl,
        );
        return Response.redirect(objectUrl, 302);
      },
    },
  },
});
