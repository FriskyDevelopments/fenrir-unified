# Community Bridge OAuth — provider registration runbook

## Status

| | |
|---|---|
| Code | Merged on `feat/community-oauth-bridge`, deployed to preview: `https://community-oauth-bridge.fenrir-bridge.pages.dev` |
| Production | **Not cut over.** The magic link on `www.myfenrir.com` is untouched. |
| Verified | 19 hermetic tests (`npm test`); routes reachable on the preview deployment |
| Not verified | The provider code exchange — needs the console credentials below |
| Blockers | 1. `PUBLIC_SITE_URL` unset in production (see below) · 2. no provider credentials · 3. the Pages **preview** environment has no `NEON_DATABASE_URL`, so the whole Community Gate (magic link included) 503s there — pre-existing, unrelated to this change |


The Community Bridge is the **Neon** login for `/community/<slug>` pages. It mints the
`fenrir_community_session` cookie and is completely separate from the operator/admin gate
on `auth.myfenrir.com` (which mints `fenrir_session` and is allow-listed to staff).

One bridge, white-label per community: the community slug travels through the OAuth round
trip inside a signed transaction cookie, so **one** OAuth client per provider serves every
community. You do **not** register a redirect URI per community.

## Flow

```
/community/<slug>
  └─ "Continue with Google"
     → GET  /api/community-auth/oauth/<provider>?slug=<slug>&return_to=/community/<slug>
        · checks the provider is enabled for that community AND has credentials
        · sets fenrir_community_oauth_tx (HttpOnly, Secure, signed, 10 min)
        → 302 to the provider consent screen
     → provider consent
     → GET/POST /api/community-auth/oauth/callback/<provider>
        · validates state + PKCE verifier + id_token nonce/issuer/audience/signature
        · requires a verified email
        · upserts fenrir_community_users (email is the join key) + membership
        · upserts fenrir_community_oauth_identities (provider, provider_subject)
        · sets fenrir_community_session
        → 302 back to /community/<slug>
```

Failures never 500 the page: the callback redirects to
`/community/<slug>?auth_error=<code>` and the gate renders a human-readable message.

## The exact callback URLs to register

Production canonical origin is **`https://www.myfenrir.com`** (the apex 301s to `www`).
The bridge builds its callback from `PUBLIC_SITE_URL`, so these are the only three URLs
that matter:

| Provider  | Register this exact URL |
|-----------|-------------------------|
| Google    | `https://www.myfenrir.com/api/community-auth/oauth/callback/google` |
| Microsoft | `https://www.myfenrir.com/api/community-auth/oauth/callback/microsoft` |
| Apple     | `https://www.myfenrir.com/api/community-auth/oauth/callback/apple` |

> **Do not remove the existing operator URLs.** The same OAuth clients are shared with the
> admin gate, which uses `https://auth.myfenrir.com/api/auth/callback/<provider>`. Each
> provider must end up with **both** URLs registered.

### ⚠️ `PUBLIC_SITE_URL` is NOT set in production — set it before going live

`siteOrigin()` returns `PUBLIC_SITE_URL` when set and otherwise falls back to the incoming
`Host`. Probing production shows the fallback is in effect — the same endpoint reports a
different origin depending on which hostname you hit:

```
$ curl -si https://www.myfenrir.com/api/auth/complete?token=invalid  | grep -i location
location: https://www.myfenrir.com/login?auth_error=oauth_transfer_invalid
$ curl -si https://auth.myfenrir.com/api/auth/complete?token=invalid | grep -i location
location: https://myfenrir.com/login?auth_error=oauth_transfer_invalid      # ← apex, no www
```

Today the gate still works out to `www` in practice, because the apex 301s to `www`
before the Function runs. But the `redirect_uri` sent to the provider is derived from
whatever `Host` reaches the Function, and providers match it **character for character**.
Any request arriving with a different host — the apex without the 301, `auth.myfenrir.com`,
a `*.pages.dev` URL — mints a `redirect_uri` the console does not know, and the token
exchange fails with `*_token_exchange_failed`.

Pin it before enabling any provider:

```bash
# Pages → fenrir-bridge → Settings → Variables and Secrets → Production
PUBLIC_SITE_URL = https://www.myfenrir.com
```

This variable is read by every endpoint that builds an absolute URL (magic-link emails,
Stripe checkout/portal returns, the operator gate), so set it to the canonical `www` origin
that those flows already produce — it pins current behaviour rather than changing it.

---

## 1. Google — OAuth client

Console: <https://console.cloud.google.com/apis/credentials> (the project that owns the
existing MyFenrir client).

1. **APIs & Services → Credentials → OAuth 2.0 Client IDs** → open the existing MyFenrir
   Web client (or **Create Credentials → OAuth client ID → Web application**).
2. **Authorized JavaScript origins** — add if absent:
   - `https://www.myfenrir.com`
   - `https://myfenrir.com`
3. **Authorized redirect URIs** — add (keep the existing `auth.myfenrir.com` one):
   - `https://www.myfenrir.com/api/community-auth/oauth/callback/google`
4. **OAuth consent screen** must be **In production** (not Testing) for non-allow-listed
   community members to sign in. Scopes needed: `openid`, `email`, `profile` — all
   non-sensitive, so no Google verification review is required.
5. Copy **Client ID** and **Client secret** into:
   - `GOOGLE_CLIENT_ID`
   - `GOOGLE_CLIENT_SECRET`

Propagation to a live redirect URI can take a few minutes on Google's side.

---

## 2. Microsoft — Entra ID app registration

Console: <https://entra.microsoft.com> → **Applications → App registrations**.

1. Open the existing MyFenrir registration, or **New registration**.
2. **Supported account types** — choose:
   > **Accounts in any organizational directory (Any Microsoft Entra ID tenant –
   > Multitenant) and personal Microsoft accounts (e.g. Skype, Xbox)**

   This is required. The bridge talks to the `/common/` endpoint and validates the issuer
   as `https://login.microsoftonline.com/<tenant-guid>/v2.0`; a single-tenant registration
   will reject community members from outside the tenant, and personal accounts
   (`9188040d-6c67-4c5b-b112-36a304b66dad`) will not be able to sign in at all.
3. **Authentication → Platform configurations → Web → Redirect URIs** — add (keep the
   existing `auth.myfenrir.com` one):
   - `https://www.myfenrir.com/api/community-auth/oauth/callback/microsoft`
4. Leave **Implicit grant** (access tokens / ID tokens) **unchecked** — the bridge uses
   authorization code + PKCE.
5. **API permissions** → Microsoft Graph delegated: `openid`, `email`, `profile`.
   Click **Grant admin consent** for the home tenant.
6. **Certificates & secrets → New client secret** → copy the **Value** (not the ID).
7. Fill in:
   - `MICROSOFT_CLIENT_ID` = Application (client) ID
   - `MICROSOFT_CLIENT_SECRET` = the secret **Value**

Note the secret's expiry date — Entra caps client secrets at 24 months and sign-in breaks
silently the day it lapses.

---

## 3. Apple — Sign in with Apple

Console: <https://developer.apple.com/account/resources>.

You need four values: **Services ID**, **Team ID**, **Key ID**, and the **.p8** key file.

1. **Identifiers → App IDs**: make sure the primary App ID has the **Sign In with Apple**
   capability enabled. (It is the "primary" the Services ID groups under.)
2. **Identifiers → Services IDs** → open the existing MyFenrir Services ID, or create one
   (`+` → **Services IDs**). The Services ID string (e.g. `com.friskydev.myfenrir.web`)
   is what goes into `APPLE_CLIENT_ID` — **not** the App ID.
3. On the Services ID → **Sign In with Apple → Configure**:
   - **Primary App ID**: the App ID from step 1.
   - **Domains and Subdomains**: `www.myfenrir.com`
     (keep `auth.myfenrir.com` if it is already listed)
   - **Return URLs** — add (keep the existing `auth.myfenrir.com` one):
     - `https://www.myfenrir.com/api/community-auth/oauth/callback/apple`

   Apple requires exact HTTPS URLs, no trailing slash, no wildcards, and no IP addresses.
4. **Keys → `+`** → name it (e.g. `MyFenrir Sign in with Apple`) → tick **Sign in with
   Apple** → **Configure** → pick the primary App ID → **Continue → Register**.
   Download `AuthKey_XXXXXXXXXX.p8`. **Apple lets you download it exactly once.**
5. Fill in:
   - `APPLE_CLIENT_ID` = the Services ID string
   - `APPLE_TEAM_ID` = the 10-character Team ID (top right of the developer portal)
   - `APPLE_KEY_ID` = the 10-character Key ID (the `XXXXXXXXXX` in the filename)
   - `APPLE_PRIVATE_KEY` = the whole `.p8` file contents, including the
     `-----BEGIN PRIVATE KEY-----` / `-----END PRIVATE KEY-----` lines, with newlines
     escaped as `\n`

   ```bash
   # produces the single-line value to paste
   awk '{printf "%s\\n", $0}' AuthKey_XXXXXXXXXX.p8
   ```

Two Apple-specific behaviours the bridge already handles:

- Apple returns via `response_mode=form_post`, a **cross-site POST**. The transaction
  cookie is therefore issued as `SameSite=None; Secure` for Apple only — a `Lax` cookie
  would be withheld on that POST and every Apple sign-in would fail with
  `oauth_state_missing`.
- With **Hide My Email**, Apple sends a `@privaterelay.appleid.com` alias. That alias is
  the account's email as far as Neon is concerned, so such a user is a *different*
  `fenrir_community_users` row than the same human signing in with Google. Expected.

---

## 4. Setting the secrets

Secrets are pushed from 1Password with a service-account token — never interactively.

```bash
export OP_SERVICE_ACCOUNT_TOKEN=...        # required; no interactive `op` fallback
npm run safe-box                            # collect/inspect
# then set each on the Pages project (production env):
#   GOOGLE_CLIENT_ID GOOGLE_CLIENT_SECRET
#   MICROSOFT_CLIENT_ID MICROSOFT_CLIENT_SECRET
#   APPLE_CLIENT_ID APPLE_TEAM_ID APPLE_KEY_ID APPLE_PRIVATE_KEY
```

Also confirm these are already set on the Pages project:

- `PUBLIC_SITE_URL=https://www.myfenrir.com` (**required**, see above)
- `SESSION_SECRET` (signs the OAuth transaction cookie)
- `NEON_DATABASE_URL`, `FENRIR_COMMUNITY_AUTH_SECRET` (the bridge 503s without these)

## 5. Neon schema

The bridge writes to `fenrir_community_oauth_identities`, already defined in
`docs/neon-community-auth-schema.sql`. Its `provider` check constraint allows only
`google` / `apple` / `microsoft` — which is why `workos` is excluded from the community
bridge and stays on the operator gate.

```bash
psql "$NEON_DATABASE_URL" -f docs/neon-community-auth-schema.sql   # idempotent
```

## 6. Turning a provider on for a community

A provider button appears on `/community/<slug>` only when **both** are true:

1. the slug's `enabled_auth_providers` includes it — Community Gate brand wizard →
   **Access → Login methods**; and
2. its credentials exist in the environment — surfaced as `available_auth_providers` on
   `GET /api/community-auth/brand/<slug>`.

Until credentials land, the wizard shows the provider as *Awaiting provider credentials*
and the public gate simply does not render the button, so nobody hits a dead end.

## 7. Verify

```bash
# 1. credentials visible to the bridge (magic_link is always present)
curl -s https://www.myfenrir.com/api/community-auth/brand/fenrir | jq '.brand.available_auth_providers'

# 2. the start endpoint 302s to the provider (not back to the gate with an auth_error)
curl -si "https://www.myfenrir.com/api/community-auth/oauth/google?slug=fenrir" | grep -i '^location'
#   expected: https://accounts.google.com/o/oauth2/v2/auth?...redirect_uri=...callback%2Fgoogle...
#   provider_not_configured  → credentials missing
#   provider_not_enabled     → not switched on for that slug in the brand wizard

# 3. end to end: open /community/fenrir in a browser and complete one provider
```

## Error codes

| `?auth_error=` | Meaning |
|---|---|
| `provider_not_configured` | credentials missing in the environment |
| `provider_not_enabled` | the community has not switched that provider on |
| `email_unverified` | the provider did not assert a verified email |
| `oauth_state_missing` | transaction cookie absent (expired, or blocked cross-site) |
| `oauth_state_invalid` / `oauth_provider_mismatch` | state mismatch — replay or a stale tab |
| `community_org_required` | the slug has no `org_id` in Neon yet |
| `*_token_exchange_failed:…` | provider rejected the code — usually a `redirect_uri` that does not match the console entry character for character |
