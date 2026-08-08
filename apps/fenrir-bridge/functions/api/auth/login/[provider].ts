// MyFenrir sign-in is Supabase-only: the client calls signInWithOAuth against
// the canonical project (yqevglppbhuoxxfsfnih) directly from the /login screen.
// No server-side login initiation exists anymore — no external auth broker is
// allowed on this host (banned, same status as Vercel).
//
// The path is kept rather than deleted so already-issued links and any cached
// bundle land on the login screen instead of a dead 404.
export const onRequestGet: PagesFunction = async (context) => {
  const requestUrl = new URL(context.request.url);
  return new Response(null, {
    status: 302,
    headers: {
      Location: `${requestUrl.origin}/login`,
      "Cache-Control": "no-store"
    }
  });
};
