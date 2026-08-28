import { useCallback, useEffect, useState } from "react";
import type { Copy, Locale } from "../i18n";
import { authService } from "../services/api";
import { friskyClientAuthEngine, type AuthProvider } from "../services/authGateway";
import { AuthProviderButton } from "../components/AuthProviderButton";
import { AuthSurface } from "../components/AuthSurface";
import { GlowCard } from "../components/GlowCard";
import { brandThemes } from "../theme/brandThemes";
import { managedDashboardPath, twoFactorHelpLinks } from "../app/shared";
import { BrandSignature } from "./routeCommon";
import { HumanVerificationGate } from "../components/HumanVerificationGate";

function postLoginDestination() {
  const requested = new URLSearchParams(window.location.search).get("next");
  return requested?.startsWith("/") && !requested.startsWith("//") ? requested : managedDashboardPath;
}

export function AuthGate({ c, locale, onLocale }: { c: Copy; locale: Locale; onLocale: (locale: Locale) => void }) {
  const theme = brandThemes.fenrir;
  const [authNote, setAuthNote] = useState<string | null>(() => authErrorMessage());
  const [humanVerified, setHumanVerified] = useState(false);
  const [enabledProviders, setEnabledProviders] = useState<AuthProvider[] | null>(null);

  useEffect(() => {
    let active = true;
    void friskyClientAuthEngine
      .enabledProviders()
      .then((providers) => active && setEnabledProviders(providers))
      .catch(() => active && setEnabledProviders([]));
    return () => {
      active = false;
    };
  }, []);
  const onHumanVerified = useCallback((verified: boolean) => {
    setHumanVerified(verified);
    if (!verified) return;
    setAuthNote(null);
    void authService.me().then((result) => {
      if (result.data.authenticated) window.location.assign(postLoginDestination());
    });
  }, []);

  async function signInWithProvider(provider: AuthProvider) {
    setAuthNote(null);
    try {
      await friskyClientAuthEngine.signInWithProvider(provider);
    } catch {
      setAuthNote(c.authProviderError);
    }
  }

  return (
    <AuthSurface theme={{ ...theme, subheadline: c.authSub }} locale={locale} onLocale={onLocale} railLabel="Fenrir ecosystem">
        <GlowCard className="auth-card" aria-label="Fenrir sign-in">
          <div className="auth-card-header">
            <span className="status good">{c.realAuth}</span>
            <span className="auth-card-kicker">{theme.authKicker}</span>
          </div>
          <h2 className="auth-enter-title" data-text={c.authTitle}>
            <span>{c.authTitle}</span>
          </h2>
          <HumanVerificationGate onVerified={onHumanVerified} />
          <div className="auth-actions">
            {enabledProviders?.map((provider) => (
              <AuthProviderButton
                key={provider}
                provider={provider}
                label={providerLabel(provider, c)}
                disabled={!humanVerified}
                onClick={() => void signInWithProvider(provider)}
              />
            ))}
            {enabledProviders === null ? <small className="muted">Checking available sign-in…</small> : null}
            {enabledProviders?.length === 0 ? (
              <small className="muted">No OAuth provider is available right now. Apple, Google, and Microsoft are the Fenrir sign-in options.</small>
            ) : null}
          </div>
          {authNote ? <small className="muted">{authNote}</small> : null}
          <p className="muted">After sign-in, Fenrir opens the Telegram gate so you can link the same admin account. No extra dens are created from this screen.</p>
          <div className="auth-2fa-recommend">
            <p className="label">{c.twoFactorRecommendTitle}</p>
            <p className="muted">{c.twoFactorRecommendBody}</p>
            <nav className="two-factor-links" aria-label="2FA provider help">
              <a href={twoFactorHelpLinks.google} target="_blank" rel="noreferrer noopener">
                {c.twoFactorGoogleLinkLabel}
              </a>
              <a href={twoFactorHelpLinks.microsoft} target="_blank" rel="noreferrer noopener">
                {c.twoFactorMicrosoftLinkLabel}
              </a>
              <a href={twoFactorHelpLinks.apple} target="_blank" rel="noreferrer noopener">
                {c.twoFactorAppleLinkLabel}
              </a>
            </nav>
          </div>
          <div className="auth-node-status" aria-label="Fenrir node status">
            <b>FENRIR NODE STATUS</b>
            {theme.nodeStatus.map((item) => (
              <span key={item}>{item}</span>
            ))}
          </div>
          <div className="auth-foot">
            <div>
              <small>{c.authEnvHint}</small>
              <nav className="legal-links" aria-label="Legal links">
                <a href="/legal">{c.legal}</a>
                <a href="/terms">{c.terms}</a>
                <a href="/privacy">{c.privacy}</a>
              </nav>
            </div>
          </div>
          <BrandSignature c={c} compact />
        </GlowCard>
    </AuthSurface>
  );
}

function providerLabel(provider: AuthProvider, c: Copy) {
  if (provider === "apple") return c.continueApple;
  if (provider === "google") return c.continueGoogle;
  return c.continueMicrosoft;
}

function authErrorMessage() {
  const error = new URLSearchParams(window.location.search).get("auth_error");
  if (!error) return null;
  const [errorCode, errorDetail] = error.split(":", 2);
  const detail = errorDetail ? decodeURIComponent(errorDetail) : "";

  if (error.startsWith("missing_env:")) {
    return "This provider is not live yet. Use an enabled sign-in option, or refresh to return to the clean Fenrir gate.";
  }
  if (error === "direct_oauth_disabled") {
    return "That old sign-in route was retired. Use the provider buttons on this Fenrir gate.";
  }
  if (errorCode === "oauth_access_denied") {
    return "The provider denied access. Try again and confirm consent to continue with this account.";
  }
  if (errorCode === "oauth_callback_error") {
    return `Provider error while returning from sign-in.${detail ? ` ${detail}` : ""}`;
  }
  if (errorCode === "code_exchange_failed") {
    return `Could not exchange the OAuth callback code. ${detail ? `(${detail})` : "Please try again."}`;
  }
  if (errorCode === "session_lookup_failed") {
    return `Could not read the Frisky login session after login. ${detail ? `(${detail})` : "Please retry from the sign-in screen."}`;
  }
  if (errorCode === "supabase_session_failed") {
    if (detail === "human_verification_required") return null;
    return `Could not open a Fenrir admin session.${detail ? ` (${detail})` : ""}`;
  }
  if (errorCode === "missing_code") {
    return "The provider did not return a sign-in code. Please try again.";
  }
  return "Sign-in could not finish. Try another provider or refresh the page.";
}
