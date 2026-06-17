import { NextRequest, NextResponse } from "next/server";
import { CLIENT_ID, API_KEY } from "../../workos";

export const dynamic = "force-dynamic";

const SITE = "https://www.myfenrir.com";

// WorkOS redirects here with ?code=... after sign-in. Exchange it for the user
// using the API key, set a session cookie, and bounce to the product.
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const error = req.nextUrl.searchParams.get("error");
  if (error) {
    return NextResponse.redirect(`${SITE}/?auth_error=${encodeURIComponent(error)}`);
  }
  if (!code) {
    return NextResponse.redirect(`${SITE}/?auth_error=missing_code`);
  }
  if (!API_KEY) {
    // Authorize succeeded (no more "Invalid client ID"), but the exchange needs
    // WORKOS_API_KEY in this project's environment. Surface it clearly.
    return NextResponse.redirect(`${SITE}/?auth_error=workos_api_key_not_set`);
  }

  try {
    const resp = await fetch("https://api.workos.com/user_management/authenticate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_id: CLIENT_ID,
        client_secret: API_KEY,
        grant_type: "authorization_code",
        code,
      }),
    });
    if (!resp.ok) {
      const detail = await resp.text();
      return NextResponse.redirect(
        `${SITE}/?auth_error=exchange_failed&detail=${encodeURIComponent(detail.slice(0, 200))}`
      );
    }
    const data = (await resp.json()) as {
      user?: { id?: string; email?: string };
      access_token?: string;
    };
    const email = data.user?.email || "";
    const res = NextResponse.redirect(`${SITE}/main`);
    // Minimal session marker; the product can read/upgrade this as needed.
    res.cookies.set("fenrir_workos_user", email, {
      domain: ".myfenrir.com",
      httpOnly: true,
      secure: true,
      sameSite: "lax",
      path: "/",
      maxAge: 60 * 60 * 24 * 7,
    });
    return res;
  } catch (e) {
    return NextResponse.redirect(
      `${SITE}/?auth_error=callback_exception&detail=${encodeURIComponent(String(e).slice(0, 160))}`
    );
  }
}
