export interface StripeWebhookEvent {
  id: string;
  type: string;
  data: { object: Record<string, unknown> };
}

export interface FounderEntitlement {
  userId: string;
  customerId: string | null;
  subscriptionId: string | null;
  status: "active" | "inactive";
  offer: "founder_pack_1499";
}

export interface EntitlementStore {
  hasProcessedEvent(eventId: string): Promise<boolean>;
  apply(eventId: string, entitlement: FounderEntitlement): Promise<void>;
}

function stringField(object: Record<string, unknown>, key: string): string | null {
  const value = object[key];
  return typeof value === "string" && value.length > 0 ? value : null;
}

function metadata(object: Record<string, unknown>): Record<string, unknown> {
  const value = object["metadata"];
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

export function entitlementFromStripeEvent(event: StripeWebhookEvent): FounderEntitlement | null {
  const object = event.data.object;
  const meta = metadata(object);
  const offer = stringField(meta, "offer");
  const userId = stringField(meta, "community_user_id") ?? stringField(object, "client_reference_id");
  if (offer !== "founder_pack_1499" || !userId) return null;

  if (event.type === "checkout.session.completed") {
    return { userId, customerId: stringField(object, "customer"), subscriptionId: stringField(object, "subscription"), status: "active", offer };
  }
  if (event.type === "customer.subscription.deleted") {
    return { userId, customerId: stringField(object, "customer"), subscriptionId: stringField(object, "id"), status: "inactive", offer };
  }
  return null;
}

export async function applyStripeEventOnce(event: StripeWebhookEvent, store: EntitlementStore): Promise<"applied" | "duplicate" | "ignored"> {
  if (await store.hasProcessedEvent(event.id)) return "duplicate";
  const entitlement = entitlementFromStripeEvent(event);
  if (!entitlement) return "ignored";
  await store.apply(event.id, entitlement);
  return "applied";
}

export async function verifyStripeSignature(input: { payload: string; signatureHeader: string; secret: string; nowSeconds?: number; toleranceSeconds?: number }): Promise<boolean> {
  const fields = input.signatureHeader.split(",").map((part) => part.trim().split("=", 2));
  const timestamp = fields.find(([key]) => key === "t")?.[1];
  const signatures = fields.filter(([key]) => key === "v1").map(([, value]) => value);
  if (!timestamp || signatures.length === 0 || !/^\d+$/.test(timestamp)) return false;
  const now = input.nowSeconds ?? Math.floor(Date.now() / 1000);
  if (Math.abs(now - Number(timestamp)) > (input.toleranceSeconds ?? 300)) return false;
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(input.secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = new Uint8Array(await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`${timestamp}.${input.payload}`)));
  const expected = Array.from(digest, (byte) => byte.toString(16).padStart(2, "0")).join("");
  return signatures.some((signature) => {
    if (signature.length !== expected.length) return false;
    let difference = 0;
    for (let i = 0; i < expected.length; i += 1) difference |= expected.charCodeAt(i) ^ signature.charCodeAt(i);
    return difference === 0;
  });
}
