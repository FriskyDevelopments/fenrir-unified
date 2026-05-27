const prefixes = {
  user: "frisky_usr",
  org: "frisky_org",
  domain: "frisky_dom",
  bridge: "frisky_brg",
  room: "frisky_room",
  invite: "frisky_inv",
  audit: "frisky_aud"
} as const;

export type FriskyIdKind = keyof typeof prefixes;

export function createFriskyId(kind: FriskyIdKind, hint = "") {
  const cleaned = hint.replace(/[^a-z0-9]/gi, "").toUpperCase().slice(0, 4);
  const random = Math.random().toString(36).slice(2, 8).toUpperCase();
  return `${prefixes[kind]}_${cleaned}${random}`.slice(0, 28);
}
