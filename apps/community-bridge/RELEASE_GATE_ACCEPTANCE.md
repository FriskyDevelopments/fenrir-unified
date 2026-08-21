# Gate acceptance release checklist

This release makes a Telegram community a verified destination and adds an
owner-operated access-request queue. It must be released as one transaction:
database first, then the Community Bridge worker and the Fenrir bot worker.

## Production prerequisites

The production Community Bridge Worker is named
`frisky-developments-llc-fenrir-unified-fenrir-unified-apps-community-bridge`
and owns the custom domain `communities.myfenrir.com`. Use
`scripts/deploy-production.sh`; it pins this live Worker name and custom-domain
binding so a deploy cannot succeed against an unused target.
Before deploying, configure these server-only secrets there:

- `NEON_DATABASE_URL`
- `SUPABASE_URL`
- `SUPABASE_PUBLISHABLE_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `COMMUNITY_BRIDGE_DESTINATION_SYNC_SECRET`
- `FENRIR_GATE_ACCESS_SECRET`

The first four already exist for the sibling MyFenrir Pages project, but must
also be provisioned to this Worker; Cloudflare does not inherit secrets across
projects. Do not copy values into this repository.

Run `npm run preflight:production` before every production deploy. It checks
only the encrypted secret names through Cloudflare and fails closed when a
binding is absent.

Configure the same paired values on `fenrir-stars-payments`:

- `COMMUNITY_BRIDGE_DESTINATION_SYNC_SECRET`
- `FENRIR_GATE_ACCESS_SECRET`

`TELEGRAM_LINK_CONFIRM_SECRET` is separately shared between the Pages project
and `fenrir-stars-payments`; it is required for account-link confirmation.

## Database migration

Apply the `cb_gate_access_requests` section from `neon/schema.sql` to the
canonical Community Bridge Neon database. It is idempotent (`create table if
not exists` and idempotent indexes) and establishes the owner acceptance
queue. Verify the table and both indexes exist before exposing `/access`.

## Deployment order

1. Apply the Neon schema addition.
2. Set the Community Bridge and bot shared secrets.
3. Deploy the prebuilt Community Bridge Worker.
4. Deploy `fenrir-stars-payments` with its gate-handoff handler.
5. Run the verification below with a non-owner test account and a test group.

## Acceptance verification

1. Link a MyFenrir account from a fresh browser-generated Telegram link.
2. In a test group, make Fenrir an admin with **Invite Users**, then run
   `/connect` as the linked owner.
3. Confirm that the verified group appears in the Gate destination selector.
4. Submit a request through the public Gate as another linked user.
5. Approve it in `/access` as the Gate owner.
6. Return to the public Gate as the applicant and open the new secure Telegram
   handoff. The bot must issue a single-use, short-lived invite for only the
   verified group.
7. Replay the same bot link and confirm it does not issue another invite.
8. Deny or revoke another request and confirm no invite can be minted.

## Release boundary

Do not deploy the whole current working tree by default. It contains unrelated
uncommitted work. The PR should include only the Gate handoff, access queue,
activation-return UX, schema, tests, and this checklist.
