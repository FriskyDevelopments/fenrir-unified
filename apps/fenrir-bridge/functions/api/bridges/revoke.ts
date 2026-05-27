import { readSession } from "../../_lib/auth";
import { dbNotConfiguredResponse, type BillingEnv } from "../../_lib/billing-env";
import { addAudit, getBridgeForOrg, mapBridge } from "../../_lib/product-db";
import { noStoreJson } from "../../_lib/responses";

export const onRequestPost: PagesFunction<BillingEnv> = async (context) => {
  const session = await readSession(context.request, context.env);
  if (!session) return noStoreJson({ ok: false, error: "authentication_required" }, { status: 401 });
  if (!context.env.DB) return dbNotConfiguredResponse();

  const body = await context.request.json<{ bridgeId?: unknown }>().catch(() => null);
  const bridgeId = typeof body?.bridgeId === "string" ? body.bridgeId : "";
  const bridge = await getBridgeForOrg(context.env.DB, session.frisky_org_id, bridgeId);
  if (!bridge) return noStoreJson({ ok: false, error: "bridge_not_found" }, { status: 404 });

  const ts = new Date().toISOString();
  await context.env.DB.batch([
    context.env.DB
      .prepare(`UPDATE frisky_invites SET status = 'revoked', revoked_at = ? WHERE id = ?`)
      .bind(ts, bridge.currentInviteId),
    context.env.DB
      .prepare(`UPDATE frisky_bridges SET status = 'revoked', revoked_at = ? WHERE id = ? AND org_id = ?`)
      .bind(ts, bridge.id, session.frisky_org_id)
  ]);
  await addAudit(context.env.DB, session, "bridge_revoked", "FriskyBridge", bridge.id, { slug: bridge.slug });

  const row = await context.env.DB.prepare(`SELECT * FROM frisky_bridges WHERE id = ?`).bind(bridge.id).first<any>();
  return noStoreJson({ ok: true, data: mapBridge(row) });
};
