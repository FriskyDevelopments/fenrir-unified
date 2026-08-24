import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { neonSql } from "@/lib/neon.server";

/**
 * El cable entre el clasificador y la cola.
 *
 * Corre en el servidor a propósito: la URL y la clave del servicio de
 * moderación nunca tocan el navegador, y el veredicto no se puede falsear
 * desde el cliente.
 *
 * El servicio vive self-hosted en hermes (ver apps/moderation-service) porque
 * los ToS de los proveedores comerciales prohíben el contenido explícito que
 * esta comunidad sí permite.
 */

const MODERATION_URL = () =>
  (process.env["MODERATION_SERVICE_URL"] || "https://moderation.myfenrir.com").replace(/\/$/, "");

type ServiceVerdict = {
  decision: "allow" | "review" | "reject";
  person: boolean;
  explicit: boolean;
  apparent_age: number | null;
  needs_human_review: boolean;
  review_reason: "no_age_reading" | "age_near_threshold" | null;
};

const inputSchema = z.object({
  /** Data URI de la imagen recién subida. */
  image: z.string().startsWith("data:").max(16_000_000),
  /** Dónde vive el objeto: lo que se guarda en la cola, nunca la imagen. */
  subject_ref: z.string().trim().min(1).max(500),
  subject_kind: z.enum(["gate_media", "brand_asset", "telegram_photo"]),
  community_id: z.string().trim().min(1).max(60),
});

export const moderateUpload = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .validator((data) => inputSchema.parse(data))
  .handler(async ({ data }) => {
    const key = process.env["MODERATION_API_KEY"];
    if (!key) {
      await enqueue(data, "other", null, null, "unconfigured");
      return { decision: "review" as const, reason: "moderation_not_configured" };
    }

    let verdict: ServiceVerdict;
    try {
      const response = await fetch(`${MODERATION_URL()}/v1/chat/completions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({
          model: "fenrir-moderation",
          messages: [
            {
              role: "user",
              content: [
                { type: "text", text: "classify" },
                { type: "image_url", image_url: { url: data.image } },
              ],
            },
          ],
        }),
        signal: AbortSignal.timeout(20_000),
      });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const body = (await response.json()) as { fenrir?: ServiceVerdict };
      if (!body.fenrir) throw new Error("missing verdict");
      verdict = body.fenrir;
    } catch (error) {
      // El clasificador caído tampoco es vía libre.
      console.error("[moderation] service unreachable", (error as Error).message);
      await enqueue(data, "other", null, null, "service_error");
      return { decision: "review" as const, reason: "moderation_unavailable" };
    }

    if (verdict.decision === "reject") {
      // NO entra a la cola: nadie tiene que mirarlo para confirmar lo evidente.
      return { decision: "reject" as const, reason: "below_minimum_age" };
    }

    if (verdict.decision === "review") {
      await enqueue(
        data,
        verdict.review_reason ?? "other",
        verdict.apparent_age,
        verdict.explicit,
        "fenrir-moderation",
      );
      return { decision: "review" as const, reason: verdict.review_reason ?? "other" };
    }

    return { decision: "allow" as const, reason: null };
  });

async function enqueue(
  data: z.infer<typeof inputSchema>,
  reason: string,
  apparentAge: number | null,
  explicit: boolean | null,
  model: string,
): Promise<void> {
  const sql = neonSql();
  const existing = (await sql`
    select id from cb_moderation_reviews
    where subject_ref = ${data.subject_ref} and status = 'pending' limit 1
  `) as Array<{ id: string }>;
  if (existing[0]) return;

  await sql`
    insert into cb_moderation_reviews
      (community_id, subject_ref, subject_kind, reason, apparent_age, explicit, classifier_model)
    values
      (${data.community_id}, ${data.subject_ref}, ${data.subject_kind}, ${reason},
       ${apparentAge}, ${explicit}, ${model})
  `;
}
