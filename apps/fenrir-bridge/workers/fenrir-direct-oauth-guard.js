const jsonHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
  "X-Fenrir-Edge": "direct-oauth-guard"
};

function json(body, init = {}) {
  return new Response(JSON.stringify(body), {
    ...init,
    headers: {
      ...jsonHeaders,
      ...(init.headers || {})
    }
  });
}

function retiredDirectOauth(pathname) {
  const route = pathname.includes("/callback/") ? "callback" : "login";
  return json(
    {
      ok: false,
      error: "direct_oauth_disabled",
      detail: `Use https://myfenrir.com/auth/{provider} instead of /api/auth/${route}/:provider. Fenrir Better Auth is the Worker on myfenrir.com/auth/*.`
    },
    { status: 410 }
  );
}

export default {
  async fetch(request) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/auth/login/") || url.pathname.startsWith("/api/auth/callback/")) {
      return retiredDirectOauth(url.pathname);
    }

    return json({ ok: false, error: "not_found" }, { status: 404 });
  }
};
