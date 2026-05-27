import { dbNotConfiguredResponse, type BillingEnv } from "../../../_lib/billing-env";
import { resolvePublicRoom } from "../../../_lib/product-db";
import { noStoreJson } from "../../../_lib/responses";

export const onRequestGet: PagesFunction<BillingEnv> = async (context) => {
  if (!context.env.DB) return dbNotConfiguredResponse();
  const hostname = new URL(context.request.url).hostname;
  const slug = String(context.params.slug ?? "").trim().toLowerCase();
  const room = await resolvePublicRoom(context.env.DB, hostname, slug);
  if (!room) return noStoreJson({ ok: false, error: "public_room_unavailable" }, { status: 404 });
  return noStoreJson({ ok: true, room });
};
