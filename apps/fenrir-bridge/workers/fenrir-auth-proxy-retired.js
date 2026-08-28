const jsonHeaders = {
  "Cache-Control": "no-store, no-cache, must-revalidate, max-age=0",
  "Content-Type": "application/json; charset=utf-8",
};

export default {
  async fetch() {
    return Response.json(
      {
        ok: false,
        error: "supabase_proxy_retired",
        detail: "Authentic/Supabase on auth.myfenrir.com is retired. Fenrir login is https://myfenrir.com/login with Better Auth at https://myfenrir.com/auth/*.",
      },
      { status: 410, headers: jsonHeaders }
    );
  },
};
