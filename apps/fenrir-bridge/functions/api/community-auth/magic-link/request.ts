import { noStoreJson } from '../../../_lib/responses';

// SSO-only standard (Apple / Microsoft / Google). Email magic-link auth is
// decommissioned: it was never wired to an email provider and email links do not
// meet the SSO-only requirement. The endpoint is kept so old clients get an explicit,
// non-crashing signal instead of a silent dead end. Sign-in is now
// /api/community-auth/oauth/<provider>.
export async function onRequestPost() {
  return noStoreJson(
    {
      ok: false,
      error: 'magic_link_disabled',
      detail: 'Email magic-link sign-in is disabled. This community uses SSO (Google / Microsoft / Apple).',
    },
    { status: 410 }
  );
}
