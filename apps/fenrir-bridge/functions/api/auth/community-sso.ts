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
  const next = safeNext(new URL(context.request.url).searchParams.get("next"));
  return new Response(null, {
    status: 302,
    headers: { Location: next, "Cache-Control": "no-store" },
  });
}
