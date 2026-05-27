import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../../_lib/billing-env";
import { addAudit, getRoomForOrg, mapRoom } from "../../_lib/product-db";
import { noStoreJson } from "../../_lib/responses";

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  const body = await context.request.json<{ roomId?: unknown }>().catch(() => null);
  const roomId = typeof body?.roomId === "string" ? body.roomId : "";
  const room = await getRoomForOrg(context.env.DB, session.frisky_org_id, roomId);
  if (!room) return noStoreJson({ ok: false, error: "room_not_found" }, { status: 404 });

  await context.env.DB.prepare(`UPDATE frisky_live_rooms SET status = 'paused' WHERE id = ? AND org_id = ?`).bind(room.id, session.frisky_org_id).run();
  await addAudit(context.env.DB, session, "live_room_paused", "FriskyLiveRoom", room.id, { slug: room.slug });

  const row = await context.env.DB.prepare(`SELECT * FROM frisky_live_rooms WHERE id = ?`).bind(room.id).first<any>();
  return noStoreJson({ ok: true, data: mapRoom(row) });
};
