import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState, type FormEvent } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AuthLayout } from "@/components/auth/auth-layout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card } from "@/components/ui/card";
import { redeemTelegramLinkCode } from "@/lib/admin.functions";
import { useAuth } from "@/hooks/use-auth";
import { useBrand } from "@/config/brand-context";
import { getSiteUrl } from "@/config/site-url";
import { brandActivateCopy } from "@/config/brands";
import { formatAuthError } from "@/lib/auth-errors";
import { TelegramIdentityCard } from "@/components/telegram/telegram-identity-card";
import {
  DEMO_LINK_CODE,
  DEMO_MALFORMED_CODE,
  DEMO_TELEGRAM_PROFILE,
  clearDemoLinkCode,
  demoRedeemLinkCode,
  expireDemoLinkCode,
  issueDemoLinkCode,
  isDemoMode,
  setDemoTelegramLinked,
  type DemoLinkCode,
  type DemoRedeemFailure,
} from "@/config/demo-mode";
import { logDemoEvent } from "@/config/demo-log";

import {
  Loader2,
  MessageCircle,
  CheckCircle2,
  ExternalLink,
  ArrowRight,
  RefreshCw,
  TimerOff,
} from "lucide-react";

const BOT_USERNAME =
  (import.meta.env["VITE_TELEGRAM_BOT_USERNAME"] as string | undefined) ?? "Myfenrir_bot";
const BOT_URL = `https://t.me/${BOT_USERNAME}`;
// Top-level navigation is intentional: the MyFenrir session cookie is scoped to
// www.myfenrir.com, where this endpoint mints the single-use Telegram deep link
// and immediately redirects to the bot. A cross-origin fetch from Community
// Bridge would not reliably carry that session.
const MYFENRIR_LINK_URL = "https://www.myfenrir.com/api/telegram/link/start";
const CODE_LENGTH = 6;

const FAILURE_COPY: Record<DemoRedeemFailure, string> = {
  malformed:
    "That code isn't in the right format. Codes are exactly 6 letters or numbers — no spaces or symbols.",
  expired: "That code has expired. Send /link in Telegram to get a fresh one.",
  invalid: "That code is invalid or has expired. Send /link in Telegram to get a new one.",
};

function normalizeCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "")
    .slice(0, CODE_LENGTH);
}

/** In demo mode we keep symbols so the malformed-code state is reachable. */
function normalizeDemoCode(raw: string): string {
  return raw
    .toUpperCase()
    .replace(/\s/g, "")
    .slice(0, CODE_LENGTH + 2);
}

export const Route = createFileRoute("/activate")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Activate your account — MyFenrir" },
      {
        name: "description",
        content: "Link your MyFenrir portal account to Telegram with a one-time activation code.",
      },
      { property: "og:title", content: "Activate your account — MyFenrir" },
      {
        property: "og:description",
        content: "Redeem your one-time code to link your MyFenrir account to Telegram.",
      },
      { property: "og:type", content: "website" },
      { property: "og:url", content: `${getSiteUrl()}/activate` },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "robots", content: "noindex" },
    ],
    links: [{ rel: "canonical", href: `${getSiteUrl()}/activate` }],
  }),
  component: ActivatePage,
});

function ActivatePage() {
  const brand = useBrand();
  const copy = brandActivateCopy(brand);
  const { session, loading, roleLoading, telegramId, refreshRole, signOut } = useAuth();
  const navigate = useNavigate();
  const redeemCode = useServerFn(redeemTelegramLinkCode);

  const [code, setCode] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingLink, setCheckingLink] = useState(false);
  const [linkStarted, setLinkStarted] = useState(false);
  const [linkCheckMessage, setLinkCheckMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [linked, setLinked] = useState(false);
  const [demo, setDemo] = useState(false);
  const [demoCode, setDemoCode] = useState<DemoLinkCode | null>(null);

  // Demo mode is client-only: resolved after hydration to avoid SSR mismatch.
  useEffect(() => {
    const on = isDemoMode();
    setDemo(on);
    if (on) {
      // Every replay attempt starts from a freshly minted code, pre-filled below.
      const issued = issueDemoLinkCode();
      setDemoCode(issued);
      setCode(issued.code);
      logDemoEvent("link", "Fresh linking code issued", `code ${issued.code} · valid 15 min`);
    }
  }, []);

  useEffect(() => {
    if (loading) return;
    if (!session) {
      navigate({ to: "/login", search: { next: undefined } });
      return;
    }
    if (!roleLoading && telegramId && !linked) {
      navigate({ to: "/dashboard" });
    }
  }, [loading, roleLoading, session, telegramId, linked, navigate]);

  function newDemoCode(prefill = true) {
    const issued = issueDemoLinkCode();
    setDemoCode(issued);
    setError(null);
    if (prefill) setCode(issued.code);
    logDemoEvent("link", "Fresh linking code issued", `code ${issued.code} · valid 15 min`);
    return issued;
  }

  async function checkTelegramLink() {
    if (checkingLink) return;
    setCheckingLink(true);
    setLinkCheckMessage(null);
    try {
      await refreshRole();
      // `telegramId` is supplied by the shared auth context and updates on the
      // next render. The redirect effect above handles the successful state.
      setLinkCheckMessage(
        "Still waiting for Telegram. If you just pressed Start, give it a moment and check again.",
      );
    } finally {
      setCheckingLink(false);
    }
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    setError(null);
    setSubmitting(true);
    try {
      if (demo) logDemoEvent("link", "Linking code submitted", `code ${code}`);

      if (demo) {
        const result = await demoRedeemLinkCode(code);
        setSubmitting(false);
        if (!result.ok) {
          // Stay on this screen so the error state can be reviewed and retried.
          setError(FAILURE_COPY[result.reason]);
          logDemoEvent("link", "Code rejected", result.reason);
          return;
        }
        setLinked(true);
        clearDemoLinkCode();
        logDemoEvent(
          "link",
          "Telegram account linked",
          `telegram_id ${DEMO_TELEGRAM_PROFILE.id} · @${DEMO_TELEGRAM_PROFILE.username}`,
        );
        await refreshRole();
        return;
      }

      const ok = await redeemCode({ data: { code } });
      if (!ok) {
        setSubmitting(false);
        setCode("");
        setError(FAILURE_COPY.invalid);
        return;
      }
      setLinked(true);
      setSubmitting(false);
      await refreshRole();
      window.setTimeout(() => window.location.replace("/gate?onboarding=1"), 1200);
    } catch (err) {
      setSubmitting(false);
      setError(formatAuthError(err instanceof Error ? err.message : String(err)));
    }
  }

  if (loading || roleLoading) {
    return (
      <AuthLayout title="Loading…">
        <div className="flex justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      </AuthLayout>
    );
  }

  if (linked) {
    return (
      <AuthLayout title={copy.successHeadline} subtitle="Your Telegram account is now linked.">
        <div className="flex flex-col items-center gap-4 py-4 text-center">
          <div className="rounded-full bg-primary/10 p-3">
            <CheckCircle2 className="h-7 w-7 text-primary" />
          </div>

          <TelegramIdentityCard
            className="w-full text-left"
            identity={demo ? DEMO_TELEGRAM_PROFILE : { id: telegramId ?? DEMO_TELEGRAM_PROFILE.id }}
            note={demo ? "Simulated Telegram identity." : undefined}
          />

          <p className="text-sm text-muted-foreground">
            {demo
              ? "Simulated link complete — your dashboard is now unlocked."
              : "Continuing to set up your gate…"}
          </p>

          <Button
            variant="fenrir"
            size="lg"
            className="w-full"
            onClick={() => window.location.replace("/gate?onboarding=1")}
          >
            Continue to gate setup
            <ArrowRight />
          </Button>
          {demo && (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => {
                setDemoTelegramLinked(false);
                setLinked(false);
                setError(null);
                newDemoCode();
                void refreshRole();
              }}
            >
              Replay the linking flow
            </Button>
          )}
        </div>
      </AuthLayout>
    );
  }

  // Production linking is a secure deep-link generated by MyFenrir. The old
  // six-character form is retained only for the explicit demo harness below.
  if (!demo) {
    return (
      <AuthLayout
        title={copy.headline}
        subtitle="Continue securely to Telegram. No code is required."
        footer={
          <button
            onClick={() => {
              signOut().then(() => navigate({ to: "/login", search: { next: undefined } }));
            }}
            className="text-muted-foreground hover:text-foreground"
          >
            Sign out
          </button>
        }
      >
        <Card variant="muted" className="p-4">
          <div className="flex items-start gap-3">
            <div className="rounded-md bg-primary/10 p-2">
              <MessageCircle className="h-4 w-4 text-primary" />
            </div>
            <div className="text-sm">
              <p className="font-medium text-foreground">Secure Telegram linking</p>
              <ol className="mt-2 space-y-1.5 text-muted-foreground">
                <li>1. Open a private, single-use Telegram link.</li>
                <li>2. Press Start in the MyFenrir bot.</li>
                <li>3. Return here and confirm the connection.</li>
              </ol>
            </div>
          </div>
        </Card>
        <Button asChild variant="fenrir" size="lg" className="mt-5 w-full">
          <a
            href={MYFENRIR_LINK_URL}
            target="_blank"
            rel="noreferrer noopener"
            onClick={() => {
              setLinkStarted(true);
              setLinkCheckMessage(null);
            }}
          >
            Continue securely
            <ExternalLink />
          </a>
        </Button>
        {linkStarted ? (
          <div className="mt-4 rounded-xl border border-primary/25 bg-primary/[.06] p-4">
            <p className="text-sm font-medium text-foreground">
              Finish in Telegram, then come right back.
            </p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              A link is valid for 15 minutes and works once. Use the newly opened Telegram tab, not
              an older message in your bot history.
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-3 w-full"
              disabled={checkingLink}
              onClick={() => void checkTelegramLink()}
            >
              {checkingLink ? <Loader2 className="animate-spin" /> : <RefreshCw />}
              {checkingLink ? "Checking Telegram…" : "I linked Telegram — check status"}
            </Button>
            {linkCheckMessage ? (
              <p className="mt-2 text-xs text-muted-foreground" role="status">
                {linkCheckMessage}
              </p>
            ) : null}
          </div>
        ) : null}
      </AuthLayout>
    );
  }

  return (
    <AuthLayout
      title={copy.headline}
      subtitle={copy.subheadline}
      footer={
        <button
          onClick={() => {
            signOut().then(() => navigate({ to: "/login", search: { next: undefined } }));
          }}
          className="text-muted-foreground hover:text-foreground"
        >
          Sign out
        </button>
      }
    >
      <Card variant="muted" className="mb-5 p-4">
        <div className="flex items-start gap-3">
          <div className="rounded-md bg-primary/10 p-2">
            <MessageCircle className="h-4 w-4 text-primary" />
          </div>
          <div className="text-sm">
            <p className="font-medium text-foreground">{copy.stepsTitle}</p>
            <ol className="mt-2 space-y-1.5 text-muted-foreground">
              <li>1. Open the {brand.name} bot in Telegram.</li>
              <li>
                2. Send{" "}
                <code className="rounded bg-background px-1.5 py-0.5 font-mono text-xs">/link</code>{" "}
                to receive a {CODE_LENGTH}-character code.
              </li>
              <li>3. Paste it below within 15 minutes.</li>
            </ol>
            <Button asChild variant="surface" size="sm" className="mt-3">
              <a href={BOT_URL} target="_blank" rel="noreferrer noopener">
                <MessageCircle />
                {copy.botLabel}
                <ExternalLink className="opacity-70" />
              </a>
            </Button>
          </div>
        </div>
      </Card>

      {demo && (
        <Card variant="muted" className="mb-5 border-primary/40 p-4">
          <p className="text-sm font-medium text-foreground">Demo mode — simulated linking</p>
          <p className="mt-1 text-xs text-muted-foreground">
            No Telegram bot is involved. A fresh code is minted on every replay and pre-filled for
            you{demoCode ? " " : ""}
            {demoCode && (
              <code className="rounded bg-background px-1.5 py-0.5 font-mono">{demoCode.code}</code>
            )}
            . The static code{" "}
            <code className="rounded bg-background px-1.5 py-0.5 font-mono">{DEMO_LINK_CODE}</code>{" "}
            always works.
          </p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Button type="button" variant="surface" size="sm" onClick={() => newDemoCode()}>
              <RefreshCw />
              New code
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                const expired = expireDemoLinkCode() ?? newDemoCode(false);
                setDemoCode(expired);
                setCode(expired.code);
                setError(null);
                logDemoEvent("link", "Code marked expired", `code ${expired.code}`);
              }}
            >
              <TimerOff />
              Expire this code
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => {
                setError(null);
                setCode(DEMO_MALFORMED_CODE);
              }}
            >
              Fill malformed code
            </Button>
          </div>
        </Card>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="code">Linking code</Label>
          <Input
            id="code"
            inputMode="text"
            autoComplete="one-time-code"
            autoFocus
            required
            disabled={submitting}
            value={code}
            onChange={(e) => {
              setError(null);
              setCode(demo ? normalizeDemoCode(e.target.value) : normalizeCode(e.target.value));
            }}
            onPaste={(e) => {
              e.preventDefault();
              setError(null);
              const pasted = e.clipboardData.getData("text");
              setCode(demo ? normalizeDemoCode(pasted) : normalizeCode(pasted));
            }}
            placeholder="ABC123"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? "code-error" : "code-hint"}
            maxLength={demo ? CODE_LENGTH + 2 : CODE_LENGTH}
            className="text-center font-mono text-lg uppercase tracking-[0.4em]"
          />
          {!error && (
            <p id="code-hint" className="text-xs text-muted-foreground">
              {CODE_LENGTH} characters, letters and numbers only. Codes expire after 15 minutes.
            </p>
          )}
        </div>
        {error && (
          <div
            id="code-error"
            role="alert"
            aria-live="polite"
            className="rounded-md border border-destructive/50 bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
            {demo && (
              <button
                type="button"
                onClick={() => newDemoCode()}
                className="mt-2 block text-xs font-medium underline underline-offset-2"
              >
                Get a fresh code
              </button>
            )}
          </div>
        )}
        <Button
          type="submit"
          variant="fenrir"
          size="lg"
          className="w-full"
          loading={submitting}
          disabled={submitting || (demo ? code.length === 0 : code.length !== CODE_LENGTH)}
        >
          {!submitting ? <CheckCircle2 /> : null}
          {copy.submitLabel}
        </Button>
      </form>
    </AuthLayout>
  );
}
