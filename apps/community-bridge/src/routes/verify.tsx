import { createFileRoute } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useEffect, useMemo, useRef, useState } from "react";
import { getCommunitySession } from "@/lib/authentik.functions";
import { finishHumanVerification, startHumanVerification } from "@/lib/human-verification.functions";
import { CANONICAL_VERIFICATION_ORIGIN } from "@/lib/human-verification";

function safeNext(value: unknown): string {
  return typeof value === "string" && value.startsWith("/") && !value.startsWith("//") ? value : "/";
}

export const Route = createFileRoute("/verify")({
  ssr: false,
  validateSearch: (search: Record<string, unknown>) => ({
    next: safeNext(search.next),
    slug: typeof search.slug === "string" ? search.slug : undefined,
    brand: typeof search.brand === "string" ? search.brand : undefined,
  }),
  component: VerificationPage,
});

function VerificationPage() {
  const search = Route.useSearch();
  const start = useServerFn(startHumanVerification);
  const finish = useServerFn(finishHumanVerification);
  const fetchSession = useServerFn(getCommunitySession);
  const [context, setContext] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);
  const finishingRef = useRef(false);

  const loginHref = useMemo(() => {
    const params = new URLSearchParams({ next: search.next });
    if (search.slug) params.set("slug", search.slug);
    if (search.brand) params.set("brand", search.brand);
    return `/login?${params.toString()}`;
  }, [search]);

  useEffect(() => {
    // `useServerFn` and router search objects are not guaranteed to retain
    // reference identity across renders. Starting twice rotates the signed
    // transaction cookie while the iframe still holds the first context, so a
    // legitimate grant is rejected as a state mismatch. One page load owns
    // exactly one verification transaction.
    if (startedRef.current) return;
    startedRef.current = true;
    let active = true;
    void fetchSession().then(({ session }) => {
      if (!active) return;
      if (session) {
        window.location.replace(search.next);
        return;
      }
      return start({ data: { slug: search.slug, brandId: search.brand } });
    }).then((result) => {
      if (active && result) setContext(result.context);
    }).catch(() => {
      if (active) setError("Human verification is temporarily unavailable.");
    });
    return () => { active = false; };
  }, [fetchSession, search, start]);

  useEffect(() => {
    if (!context) return;
    const receive = (event: MessageEvent) => {
      if (event.origin !== CANONICAL_VERIFICATION_ORIGIN) return;
      const message = event.data as { type?: string; verified?: boolean; grant?: string; context?: string };
      if (message.type !== "friskydev-human-verification" || message.verified !== true || message.context !== context || !message.grant) return;
      if (finishingRef.current) return;
      finishingRef.current = true;
      void finish({ data: { grant: message.grant, context } })
        .then(() => window.location.replace(loginHref))
        .catch(() => {
          finishingRef.current = false;
          setError("The verification proof could not be confirmed. Please try again.");
        });
    };
    window.addEventListener("message", receive);
    return () => window.removeEventListener("message", receive);
  }, [context, finish, loginHref]);

  const frameUrl = context ? `${CANONICAL_VERIFICATION_ORIGIN}/?${new URLSearchParams({
    audience: window.location.origin,
    context,
  }).toString()}` : null;

  return (
    <main className="min-h-dvh bg-[#050609]">
      {error ? (
        <div role="alert" className="mx-auto flex min-h-dvh max-w-md items-center px-6 text-center text-sm text-red-200">{error}</div>
      ) : frameUrl ? (
        <iframe
          src={frameUrl}
          title="FriskyDEV human verification"
          className="h-dvh w-full border-0"
          sandbox="allow-forms allow-scripts allow-same-origin"
          referrerPolicy="no-referrer"
        />
      ) : (
        <div className="min-h-dvh" aria-busy="true" aria-label="Preparing human verification" />
      )}
    </main>
  );
}
