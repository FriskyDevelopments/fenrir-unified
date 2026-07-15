import { noStoreJson } from '../../../_lib/responses';

// SSO-only standard: email magic-link consumption is decommissioned alongside the
// request endpoint. Any outstanding tokens are inert. See ./request.ts.
function magicLinkDisabled() {
  return noStoreJson(
    {
      ok: false,
      error: 'magic_link_disabled',
      detail: 'Email magic-link sign-in is disabled. This community uses SSO (Google / Microsoft / Apple).',
    },
    { status: 410 }
  );
}

export async function onRequestPost() {
  return magicLinkDisabled();
}

export async function onRequestGet() {
  return magicLinkDisabled();
}
