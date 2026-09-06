// Community Bridge and the main MyFenrir app deliberately keep independent
// identities. This endpoint is only a safe navigation handoff for links that
// originate in the main app; it must never mint, copy, or inspect either
// product's session.

const COMMUNITY_ORIGIN = "https://communities.myfenrir.com";

function safeNext(raw: string | null) {
  if (!raw) return `${COMMUNITY_ORIGIN}/dashboard`;
  try {
    const url = new URL(raw, COMMUNITY_ORIGIN);
    return url.origin === COMMUNITY_ORIGIN
      ? url.toString()
      : `${COMMUNITY_ORIGIN}/dashboard`;
  } catch {
    return `${COMMUNITY_ORIGIN}/dashboard`;
  }
}

export async function onRequestGet(context: { request: Request }) {
  const requestUrl = new URL(context.request.url);
  const next = new URL(safeNext(requestUrl.searchParams.get("next")));
  const login = new URL("/login", COMMUNITY_ORIGIN);
  // Existing Community sessions resume next in /login; signed-out visitors
  // start Community's own provider flow. This handoff never copies app identity.
  login.searchParams.set("next", next.pathname === "/login" ? "/dashboard" : `${next.pathname}${next.search}${next.hash}`);
  for (const key of ["brand", "gate"]) {
    const value = requestUrl.searchParams.get(key);
    if (value) login.searchParams.set(key, value);
  }
  return new Response(null, {
    status: 302,
    headers: { Location: login.toString(), "Cache-Control": "no-store" },
  });
}
