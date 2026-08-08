# Neon ↔ Fenrir Gatekeeper internal contract

`POST /api/internal/community/allowlist-check` is a server-to-server endpoint for the `fenrir-gatekeeper` Worker. It is not a browser or public community-auth route.

Request headers:

```text
Authorization: Bearer <FENRIR_GATEKEEPER_INTERNAL_SECRET>
Content-Type: application/json
```

Request JSON must include `community_slug` and `email`. `telegram_user_id` may be included as caller context, but it is intentionally ignored for authorization: the current Neon schema keys membership by email and does not persist a Telegram identity field. Callers must not interpret a successful response as verification of the supplied Telegram identity.

Response: `{ ok: true, allowed: boolean, community_slug }`. Missing/incorrect authentication returns `401`; malformed input `400`; missing Neon configuration `503`. The query only allows an active membership whose user is also `access_status = 'active'` in the requested community.

Required Pages secret: `FENRIR_GATEKEEPER_INTERNAL_SECRET`. The value is never logged, returned, or committed.
