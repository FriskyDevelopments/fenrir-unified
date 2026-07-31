import { handleCommunityOAuthStart, type CommunityOAuthEnv } from "../../../_lib/community-oauth";

export const onRequestGet: PagesFunction<CommunityOAuthEnv, "provider"> = async (context) => {
  return handleCommunityOAuthStart({
    request: context.request,
    env: context.env,
    provider: String(context.params.provider)
  });
};
