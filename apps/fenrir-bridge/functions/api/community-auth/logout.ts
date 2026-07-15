import {
  communityCookieDomain,
  communitySessionClearCookie,
  type CommunityAuthEnv,
} from '../../_lib/community-auth';
import { noStoreJson } from '../../_lib/responses';

export const onRequestPost: PagesFunction<CommunityAuthEnv> = async (context) => {
  const domain = communityCookieDomain(context.request, context.env);
  return noStoreJson(
    { ok: true },
    {
      headers: {
        'Set-Cookie': communitySessionClearCookie(domain),
      },
    }
  );
};
