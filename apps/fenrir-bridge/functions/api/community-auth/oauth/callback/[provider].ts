import {
  handleCommunityOAuthCallback,
  type CommunityOAuthEnv,
} from '../../../../_lib/community-oauth';

async function handleCallback(context: EventContext<CommunityOAuthEnv, 'provider', unknown>) {
  return handleCommunityOAuthCallback({
    request: context.request,
    env: context.env,
    provider: context.params.provider,
  });
}

export const onRequestGet: PagesFunction<CommunityOAuthEnv> = handleCallback;
export const onRequestPost: PagesFunction<CommunityOAuthEnv> = handleCallback;
