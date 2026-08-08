/**
 * Cross-tab brand/theme broadcast channel.
 *
 * Theme/branding lives in `brand_tenants`, which BrandProvider caches after its
 * first fetch, plus an unsaved wizard draft in localStorage. Both kinds of
 * change are published on one shared channel so every mounted BrandProvider —
 * this tab and any open login/admin/activate tab — re-applies the CSS variables
 * immediately without a manual refresh.
 *
 *   "saved" → a tenant row was created/updated/deleted: drop the cache, refetch.
 *   "draft" → the wizard draft changed: re-read it from localStorage.
 */

const CHANNEL = "brand-tenants-updated";

export type BrandUpdateKind = "saved" | "draft";

type BrandUpdateMessage = { kind: BrandUpdateKind; at: number };

let channel: BroadcastChannel | null | undefined;

function getChannel(): BroadcastChannel | null {
  if (channel !== undefined) return channel;
  try {
    channel = new BroadcastChannel(CHANNEL);
  } catch {
    channel = null; // unsupported — the storage event below covers us
  }
  return channel;
}

const listeners = new Set<(kind: BrandUpdateKind) => void>();
let wired = false;

function emit(kind: BrandUpdateKind) {
  for (const listener of listeners) listener(kind);
}

function parse(raw: unknown): BrandUpdateKind {
  if (typeof raw === "string") {
    try {
      const parsed = JSON.parse(raw) as BrandUpdateMessage;
      if (parsed?.kind === "draft" || parsed?.kind === "saved") return parsed.kind;
    } catch {
      /* legacy timestamp payload */
    }
    return "saved";
  }
  const message = raw as BrandUpdateMessage | null;
  return message?.kind === "draft" ? "draft" : "saved";
}

function wire() {
  if (wired) return;
  wired = true;

  const bc = getChannel();
  if (bc) bc.onmessage = (event) => emit(parse(event.data));

  window.addEventListener("storage", (event) => {
    if (event.key === CHANNEL) emit(parse(event.newValue));
  });
}

export function publishBrandUpdate(kind: BrandUpdateKind = "saved") {
  const message: BrandUpdateMessage = { kind, at: Date.now() };
  try {
    getChannel()?.postMessage(message);
  } catch {
    /* channel closed — the storage write below still notifies other tabs */
  }
  try {
    window.localStorage.setItem(CHANNEL, JSON.stringify(message));
  } catch {
    /* private mode: same-tab refresh still happens via refreshBrands() */
  }
  // BroadcastChannel never echoes to the sender, so notify this tab directly.
  emit(kind);
}

export function subscribeBrandUpdates(onUpdate: (kind: BrandUpdateKind) => void): () => void {
  wire();
  listeners.add(onUpdate);
  return () => {
    listeners.delete(onUpdate);
  };
}

/** Whether this browser supports the cross-tab BroadcastChannel transport. */
export function isBrandSyncSupported(): boolean {
  return getChannel() !== null;
}
