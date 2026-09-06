# Fenrir OAuth console walkthrough

Use this when Google / Microsoft / Apple still bounce to `/auth/callback` and
the Worker returns:

```json
{"error":"unknown_provider","provider":"callback"}
```

Live Worker start URLs already send the correct `redirect_uri`. The consoles
must allowlist that exact string. Do not create a new OAuth client.

## Canonical URIs (apex only)

| Provider | Start | Redirect / Return URI |
|---|---|---|
| Google | `https://myfenrir.com/auth/google` | `https://myfenrir.com/auth/google/callback` |
| Microsoft | `https://myfenrir.com/auth/microsoft` | `https://myfenrir.com/auth/microsoft/callback` |
| Apple | `https://myfenrir.com/auth/apple` | `https://myfenrir.com/auth/apple/callback` |

Live client IDs observed on 2026-09-02:

- Google: `411033642222-3cbc7g2sjq9navh6lqfuclhbj0hj4cp4.apps.googleusercontent.com`
- Microsoft: `bd7f4392-853c-4c41-89e7-443691424188`
- Apple Services ID: `com.myfenrir.FenrirProtocol`

## 1. Google Auth Platform

1. Open [Google Auth Platform → Clients](https://console.cloud.google.com/auth/clients).
2. Open the existing **Web** client whose ID matches `411033642222-3cbc7g2sjq9navh6lqfuclhbj0hj4cp4`.
3. Under **Authorized redirect URIs**, add exactly:
   `https://myfenrir.com/auth/google/callback`
4. Remove, if present:
   - `https://www.myfenrir.com/auth/callback`
   - `https://myfenrir.com/auth/callback`
   - `https://auth.myfenrir.com/api/auth/callback/google`
   - `https://www.myfenrir.com/api/auth/callback/google`
   - `https://www.myfenrir.com/api/frisky-auth/callback/google`
5. **Authorized JavaScript origins** (optional for this code flow):
   - `https://myfenrir.com`
   - `https://www.myfenrir.com`
6. Save. Wait 1–5 minutes.
7. Verify: `curl -sSI https://myfenrir.com/auth/google` Location header must contain
   `redirect_uri=https%3A%2F%2Fmyfenrir.com%2Fauth%2Fgoogle%2Fcallback`.

## 2. Microsoft Entra ID

1. Open [Entra ID → App registrations](https://entra.microsoft.com/#view/Microsoft_AAD_RegisteredApps/ApplicationsListBlade).
2. Open the app whose Application (client) ID is `bd7f4392-853c-4c41-89e7-443691424188`.
3. **Authentication** → **Platform configurations** → **Web**.
4. Add redirect URI:
   `https://myfenrir.com/auth/microsoft/callback`
5. Remove the stale SPA / broker URIs listed in the Google section, swapping `google` for `microsoft`.
6. Keep `openid`, `email`, `profile`. Implicit grant is not required (code + PKCE).
7. Save.
8. Verify: `curl -sSI https://myfenrir.com/auth/microsoft` Location must contain
   `redirect_uri=https%3A%2F%2Fmyfenrir.com%2Fauth%2Fmicrosoft%2Fcallback`.

## 3. Apple Developer — Sign in with Apple

1. Open [Certificates, Identifiers & Profiles](https://developer.apple.com/account/resources/identifiers/list).
2. Open the **Services ID** `com.myfenrir.FenrirProtocol` (not the App ID).
3. Enable Sign in with Apple → Configure.
4. Domains and Subdomains: `myfenrir.com`
5. Return URLs: `https://myfenrir.com/auth/apple/callback`
6. Remove `https://www.myfenrir.com/auth/callback` and any `/api/auth/callback/apple` return URLs.
7. Save. Apple can take several minutes to propagate.
8. The Worker accepts Apple's `form_post` POST on that return URL.
9. Verify: `curl -sSI https://myfenrir.com/auth/apple` Location must contain
   `redirect_uri=https%3A%2F%2Fmyfenrir.com%2Fauth%2Fapple%2Fcallback` and `response_mode=form_post`.

## After consoles match

```bash
curl -sS https://myfenrir.com/auth/google/callback
# expect: {"error":"missing_code_or_state"}   — route exists

curl -sS https://myfenrir.com/auth/callback
# stale SPA URI. Must not be used as an IdP redirect.

curl -sS https://myfenrir.com/auth/ready
# providers.google/microsoft/apple should be true
# database:false means Neon is still down; KV can still hold sessions
```

Then click Continue with Google / Microsoft / Apple from `https://myfenrir.com/login`.
Do not start OAuth with Supabase `redirectTo=https://www.myfenrir.com/auth/callback`.
