import { handleCommunityOAuthCallback, type CommunityOAuthEnv } from "../../../../_lib/community-oauth";

const handleCallback: PagesFunction<CommunityOAuthEnv, "provider"> = async (context) => {
  return handleCommunityOAuthCallback({
    request: context.request,
    env: context.env,
    provider: String(context.params.provider)
  });
};

export const onRequestGet = handleCallback;
// Apple uses response_mode=form_post, so the callback must accept POST too.
export const onRequestPost = handleCallback;
