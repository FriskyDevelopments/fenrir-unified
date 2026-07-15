import { noStoreJson } from '../../../_lib/responses';
import {
  createOAuthTransaction,
  getAuthorizationUrl,
  isDirectOAuthAvailable,
  isOAuthProvider,
  safeAllowedReturnTo,
  transactionSetCookie,
  validateRedirectUri,
  type OAuthEnv,
} from '../../../_lib/oauth';
import { authOrigin, siteOrigin } from '../../../_lib/billing-env';

export const onRequestGet: PagesFunction<OAuthEnv> = async (context) => {
  const provider = context.params.provider;
  if (!isOAuthProvider(provider)) {
    return noStoreJson({ ok: false, error: 'unsupported_provider' }, { status: 404 });
  }

  if (!isDirectOAuthAvailable(provider, context.env)) {
    return noStoreJson(
      {
        ok: false,
        error: 'direct_oauth_disabled',
        detail: 'Set the direct OAuth client ID/secret environment variables for this provider.',
      },
      { status: 410 }
    );
  }

  try {
    const origin = authOrigin(context.request, context.env);
    const callbackUri = `${origin}/api/auth/callback/${provider}`;
    const requestUrl = new URL(context.request.url);

    // Validate the redirect URI if one was provided in the query params (e.g. for white-labeling)
    // The 'redirect_uri' is where the user goes AFTER the entire flow is complete.
    // The 'callbackUri' is where the OAuth provider sends the user back to us.
    const finalRedirectUri = validateRedirectUri(
      requestUrl.searchParams.get('redirect_uri'),
      context.env
    );
    const returnTo = safeAllowedReturnTo(
      requestUrl.searchParams.get('return_to') || finalRedirectUri,
      context.env
    );

    const tx = await createOAuthTransaction(provider, context.env, returnTo);
    const url = await getAuthorizationUrl(provider, context.env, callbackUri, tx);

    return new Response(null, {
      status: 302,
      headers: {
        Location: url,
        'Set-Cookie': await transactionSetCookie(tx, context.env),
      },
    });
  } catch (error) {
    // A misconfigured environment (e.g. missing SESSION_SECRET / PUBLIC_SITE_URL)
    // must not surface as an opaque 500 on the login button. Redirect back to the
    // login screen with a diagnosable error code, matching the callback handler.
    console.error('OAuth login initiation failed', error);
    const message = error instanceof Error ? error.message : 'oauth_login_init_failed';
    const siteBase = siteOrigin(context.request, context.env);
    const params = new URLSearchParams({
      auth_error: 'oauth_login_init_failed',
      auth_error_detail: message,
    });
    return new Response(null, {
      status: 302,
      headers: { Location: `${siteBase}/login?${params.toString()}` },
    });
  }
};
