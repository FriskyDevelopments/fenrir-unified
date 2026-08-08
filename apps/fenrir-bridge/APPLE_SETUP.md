# Enabling "Sign in with Apple" for Fenrir

The app code is **already wired for Apple** end to end — no code changes are
needed:

- Login button: `src/App.tsx` renders "Continue with Apple".
- Routing: it calls `/api/auth/workos/login?provider=apple`.
- Broker mapping: `functions/_lib/workos.ts` maps `apple -> "AppleOAuth"`
  (WorkOS's built-in Apple connection).

So enabling Apple is purely **dashboard configuration** across two portals:
the **Apple Developer** portal and the **WorkOS** dashboard. No terminal, no
deploy. Plan ~20-30 minutes; Apple is the fussiest of the three providers and
requires a **paid Apple Developer account**.

> Tip: if you just want login working fast, enable **Google** first (much
> simpler) and come back to Apple.

---

## What you'll end up with

| Field | Where it comes from |
| --- | --- |
| Services ID (client ID) | Apple Developer -> Identifiers |
| Team ID | Apple Developer -> Membership |
| Key ID | Apple Developer -> Keys |
| Private key (`.p8`) | Apple Developer -> Keys (downloaded once) |
| Return URL | WorkOS shows it when you enable the Apple connection |

---

## Part A — Apple Developer portal (developer.apple.com)

1. **App ID**: Certificates, Identifiers & Profiles -> **Identifiers** -> your
   App ID -> enable the **Sign in with Apple** capability -> Save.

2. **Services ID** (this becomes the OAuth client ID):
   - Identifiers -> **+** -> **Services IDs** -> Continue.
   - Description: `Fenrir Web Auth`; Identifier: e.g. `com.myfenrir.auth`
     (reverse-domain; remember this exact string).
   - After creating it, open it -> check **Sign in with Apple** -> **Configure**:
     - **Primary App ID**: select your App ID from step 1.
     - **Domains and Subdomains**: `auth.myfenrir.com`
     - **Return URLs**: paste the **exact** callback WorkOS gives you in
       Part B step 3 (it looks like
       `https://auth.workos.com/sso/oauth/apple/callback` or similar — use the
       value WorkOS displays, not a guess).
   - Save.

3. **Key** (the `.p8`):
   - Keys -> **+** -> name it `Fenrir Apple Sign In` -> check **Sign in with
     Apple** -> Configure -> select your Primary App ID -> Save -> Register.
   - **Download** the `.p8` file. **You can only download it once.** Store it in
     a password manager.
   - Note the **Key ID** shown next to it.

4. **Team ID**: top-right of the portal under **Membership** (10-char string).

---

## Part B — WorkOS dashboard (dashboard.workos.com)

1. **Redirect URI** (one-time, applies to all providers):
   Authentication -> Redirects -> set the AuthKit redirect to exactly:
   ```
   https://auth.myfenrir.com/api/auth/callback/workos
   ```

2. Authentication -> **AuthKit / Connections** -> find **Apple** -> **Enable**.

3. WorkOS shows the **Return URL** you must paste back into Apple (Part A step
   2). Copy it now.

4. Fill the Apple credentials WorkOS asks for, from Part A:
   - **Services ID** (e.g. `com.myfenrir.auth`)
   - **Team ID**
   - **Key ID**
   - **Private key**: paste the full contents of the `.p8` file, including the
     `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` lines.
   - Save / activate the connection.

---

## Part C — Verify

After both portals are saved (no redeploy needed — this is provider config on
WorkOS's side):

1. Go to `https://www.myfenrir.com` -> click **Continue with Apple**.
2. You should be redirected to Apple's sign-in, then back to Fenrir signed in.

If it bounces back to `/login?auth_error=...`:
- **redirect/return URL mismatch** is the #1 cause — the Return URL in Apple
  must byte-for-byte match the one WorkOS displayed.
- Make sure the WorkOS Apple connection is **active**, not just saved as draft.
- Confirm the Services ID in WorkOS matches the identifier you created.

---

## Notes

- The same WorkOS redirect URI in Part B step 1 is also required for Google and
  Microsoft — set it once.
- Google and Microsoft built-in connections in WorkOS are much lighter: enable,
  and for production you supply your own OAuth client ID/secret from their
  respective consoles (no `.p8` dance).
- None of this requires touching `CLOUDFLARE_*`, `SESSION_SECRET`, or the
  deploy — those are separate and already documented in `scripts/deploy-prod.sh`.
