// Self-contained Cloudflare Worker login for myfenrir.com.
// Fixes the "Invalid client ID" bug (the old Vercel app sent client_replace_me)
// by sending the valid client id + a registered redirect, and completing the
// WorkOS code exchange server-side with WORKOS_API_KEY.

const VALID_CLIENT_ID = "client_01KT7NWYWB256XP0V00PX1YW01";
const PROVIDER_MAP = { google: "GoogleOAuth", microsoft: "MicrosoftOAuth", apple: "AppleOAuth", authkit: "authkit" };

function cfg(env) {
  return {
    clientId: (env.WORKOS_CLIENT_ID || VALID_CLIENT_ID).trim(),
    apiKey: (env.WORKOS_API_KEY || "").trim(),
    redirectUri: (env.WORKOS_REDIRECT_URI || "https://login.myfenrir.com/auth/callback").trim(),
    site: (env.SITE_URL || "https://www.myfenrir.com").trim(),
  };
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const c = cfg(env);

    if (url.pathname === "/api/auth/login") {
      const provider = url.searchParams.get("provider") || "authkit";
      const p = new URLSearchParams({
        client_id: c.clientId,
        redirect_uri: c.redirectUri,
        response_type: "code",
        provider: PROVIDER_MAP[provider] || "authkit",
      });
      return Response.redirect(`https://api.workos.com/user_management/authorize?${p.toString()}`, 302);
    }

    if (url.pathname === "/auth/callback") {
      const code = url.searchParams.get("code");
      const error = url.searchParams.get("error");
      if (error) return Response.redirect(`${c.site}/?auth_error=${encodeURIComponent(error)}`, 302);
      if (!code) return Response.redirect(`${c.site}/?auth_error=missing_code`, 302);
      if (!c.apiKey) return Response.redirect(`${c.site}/?auth_error=workos_api_key_not_set`, 302);
      try {
        const resp = await fetch("https://api.workos.com/user_management/authenticate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ client_id: c.clientId, client_secret: c.apiKey, grant_type: "authorization_code", code }),
        });
        if (!resp.ok) {
          const d = await resp.text();
          return Response.redirect(`${c.site}/?auth_error=exchange_failed&detail=${encodeURIComponent(d.slice(0, 160))}`, 302);
        }
        const data = await resp.json();
        const email = (data.user && data.user.email) || "";
        const headers = new Headers({ Location: `${c.site}/main` });
        headers.append(
          "Set-Cookie",
          `fenrir_workos_user=${encodeURIComponent(email)}; Domain=.myfenrir.com; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=604800`
        );
        return new Response(null, { status: 302, headers });
      } catch (e) {
        return Response.redirect(`${c.site}/?auth_error=callback_exception`, 302);
      }
    }

    // Login page.
    return new Response(loginHtml(), { headers: { "Content-Type": "text/html; charset=utf-8" } });
  },
};

function loginHtml() {
  const btn = (id, label, bg) =>
    `<a href="/api/auth/login?provider=${id}" data-testid="button-${id}" style="display:flex;align-items:center;justify-content:center;width:100%;padding:14px 16px;border-radius:12px;font-size:14px;font-weight:500;color:rgba(255,255,255,.88);text-decoration:none;border:1px solid rgba(255,255,255,.12);margin-bottom:12px;background:${bg};box-sizing:border-box">${label}</a>`;
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>MyFenrir — Secure Access</title></head>
<body style="margin:0;font-family:'Inter','Helvetica Neue',sans-serif">
<div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(ellipse at 60% 40%,#0d2e1f 0%,#091a12 40%,#050e0a 100%)">
  <div style="width:400px;max-width:92vw;background:rgba(12,22,16,.85);border:1px solid rgba(255,255,255,.1);border-radius:16px;padding:24px;backdrop-filter:blur(20px);box-shadow:0 32px 80px rgba(0,0,0,.6)">
    <div style="font-weight:900;letter-spacing:.15em;color:#e8e0d0;margin-bottom:18px">FENRIR</div>
    <h2 style="font-weight:900;text-transform:uppercase;font-size:1.9rem;margin:0 0 24px;color:#e8e8e0">Enter <span style="color:#60d090">Fenrir.</span></h2>
    ${btn("apple", "Continue with Apple", "linear-gradient(135deg,#2a2a2e,#1a1a1f)")}
    ${btn("google", "Continue with Google", "linear-gradient(135deg,#1a2a1a,#1a231a)")}
    ${btn("microsoft", "Continue with Microsoft", "linear-gradient(135deg,#1a1f2e,#151a28)")}
    <a href="/api/auth/login?provider=authkit" style="display:block;text-align:center;margin-top:8px;padding:10px 16px;border-radius:10px;font-size:13px;font-weight:600;color:rgba(160,190,255,.9);text-decoration:none;background:rgba(80,120,200,.2);border:1px solid rgba(80,120,200,.4)">More sign-in options</a>
  </div>
</div></body></html>`;
}
