import { handleCommunityOAuthStart, type CommunityOAuthEnv } from '../../../_lib/community-oauth';

export const onRequestGet: PagesFunction<CommunityOAuthEnv> = async (context) => {
  return handleCommunityOAuthStart({
    request: context.request,
    env: context.env,
    provider: context.params.provider,
  });
};
