import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Server-side image verification for user uploads.
 *
 * Every image uploaded to gate-media / brand-assets is screened with the
 * OpenAI Moderation API (`omni-moderation-latest` — free of charge) before the
 * app accepts it. Anything flagged in a blocked category is deleted from
 * storage immediately and rejected. Fail-closed: if the moderation service is
 * unavailable or unconfigured, the image is deleted and rejected rather than
 * let unscreened content through.
 *
 * Requires OPENAI_API_KEY in the server environment.
 *
 * Known limits: only raster formats the API accepts (png/jpeg/gif/webp) can be
 * screened; SVG/AVIF and video uploads are rejected here only when the caller
 * routes them through — see the upload components for which types they send.
 */

const MODERATABLE_TYPES = new Set(["image/png", "image/jpeg", "image/gif", "image/webp"]);

/** Categories that reject an upload outright when the API flags them. */
const BLOCKED_CATEGORIES = ["sexual", "sexual/minors", "violence/graphic"] as const;

const MAX_MODERATED_BYTES = 15 * 1024 * 1024;

const inputSchema = z.object({
  bucket: z.enum(["gate-media", "brand-assets"]),
  path: z.string().min(1).max(500),
});

type Verdict = { allowed: boolean; reason?: string };

async function deleteObject(bucket: string, path: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.storage.from(bucket).remove([path]);
}

export const verifyUploadedImage = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data) => inputSchema.parse(data))
  .handler(async ({ context, data }): Promise<Verdict> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verification can delete the object, so callers may only target uploads
    // they were allowed to make: their own gate-media folder, or any
    // brand-asset if they are staff.
    if (data.bucket === "gate-media" && !data.path.startsWith(`${context.userId}/`)) {
      return { allowed: false, reason: "You can only verify your own uploads." };
    }
    if (data.bucket === "brand-assets") {
      const { data: roleRow } = await context.supabase
        .from("user_roles")
        .select("role")
        .eq("user_id", context.userId)
        .maybeSingle();
      if (roleRow?.role !== "owner" && roleRow?.role !== "admin") {
        return { allowed: false, reason: "Only staff can verify brand assets." };
      }
    }

    const { data: blob, error: downloadError } = await supabaseAdmin.storage
      .from(data.bucket)
      .download(data.path);
    if (downloadError || !blob) {
      return { allowed: false, reason: "Uploaded file could not be read for verification." };
    }

    if (blob.size > MAX_MODERATED_BYTES) {
      await deleteObject(data.bucket, data.path);
      return { allowed: false, reason: "Image is too large to verify." };
    }

    const contentType = blob.type || "application/octet-stream";
    if (!MODERATABLE_TYPES.has(contentType)) {
      await deleteObject(data.bucket, data.path);
      return {
        allowed: false,
        reason: "Only PNG, JPEG, GIF or WEBP images can be verified. Use one of those formats.",
      };
    }

    const apiKey = process.env["OPENAI_API_KEY"];
    if (!apiKey) {
      // Fail closed: no unscreened images. Surface a config-shaped message so
      // a missing key is obvious in deploys instead of looking like bad files.
      await deleteObject(data.bucket, data.path);
      console.error("[moderation] OPENAI_API_KEY is not set — rejecting upload fail-closed.");
      return { allowed: false, reason: "Image verification is not configured on this server." };
    }

    const base64 = Buffer.from(await blob.arrayBuffer()).toString("base64");

    let flagged: string[];
    try {
      const res = await fetch("https://api.openai.com/v1/moderations", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: "omni-moderation-latest",
          input: [
            {
              type: "image_url",
              image_url: { url: `data:${contentType};base64,${base64}` },
            },
          ],
        }),
      });
      if (!res.ok) {
        throw new Error(`moderation API returned ${res.status}`);
      }
      const body = (await res.json()) as {
        results?: { categories?: Record<string, boolean> }[];
      };
      const categories = body.results?.[0]?.categories ?? {};
      flagged = BLOCKED_CATEGORIES.filter((c) => categories[c]);
    } catch (err) {
      // Fail closed on any service error as well.
      await deleteObject(data.bucket, data.path);
      console.error("[moderation] verification failed:", err);
      return { allowed: false, reason: "Image verification is temporarily unavailable." };
    }

    if (flagged.length > 0) {
      await deleteObject(data.bucket, data.path);
      return { allowed: false, reason: "This image is not allowed here." };
    }

    return { allowed: true };
  });
