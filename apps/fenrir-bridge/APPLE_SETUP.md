# Sign in with Apple — MyFenrir

Apple sign-in runs through **Supabase Auth on the canonical MyFenrir project
(`yqevglppbhuoxxfsfnih`)** — the same broker as Google and Microsoft. No
external auth broker is allowed (banned, same status as Vercel).

- UI: the "Continue with Apple" button on `/login`.
- Routing: the client calls `supabase.auth.signInWithOAuth({ provider: "apple" })`
  (see `src/services/supabaseAuth.ts`); Apple returns to the Supabase callback
  and `/api/auth/supabase-session` mints the Fenrir session cookie.

## Configuration lives in two dashboards

Everything is point-and-click between the **Apple Developer** portal and the
**Supabase** dashboard (Authentication → Providers → Apple). No terminal.

### Apple Developer portal (developer.apple.com)

1. **Identifiers → App ID**: an App ID with "Sign in with Apple" enabled.
2. **Identifiers → Services ID**: the web client. Its identifier is the
   `client_id` Supabase asks for.
   - **Domains**: `yqevglppbhuoxxfsfnih.supabase.co`
   - **Return URLs**: `https://yqevglppbhuoxxfsfnih.supabase.co/auth/v1/callback`
3. **Keys**: a "Sign in with Apple" private key (`.p8`). Note the Key ID and
   your Team ID — Supabase needs all three to build the client secret.

### Supabase dashboard

1. Authentication → Providers → **Apple** → enable.
2. Fill Services ID (client id), Team ID, Key ID and the `.p8` key contents.
3. Authentication → URL Configuration: make sure the app origins
   (`https://www.myfenrir.com`, `https://communities.myfenrir.com`) are on the
   redirect allow-list.

That's it — the same project already serves Google (`google`) and Microsoft
(`azure`), so Apple simply joins the provider list the login screen renders.
