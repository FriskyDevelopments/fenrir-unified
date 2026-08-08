/**
 * Live auth screen preview for the brand admin console.
 *
 * Renders the sign-in screen and the "Activate your account" Telegram linking
 * screen from a draft tenant record — theme tokens, logo, wordmark, terminal
 * command, headline copy and provider order — inside a scoped element so admins
 * can build both screens without a deploy. Purely presentational: no auth calls.
 */

import { useState } from "react";
import { brandInitials, type BrandConfig } from "@/config/brands";
import { brandActivateCopy, brandLoginCopy } from "@/config/brands";
import { cn } from "@/lib/utils";

const PROVIDER_NAME: Record<string, string> = {
  apple: "Apple",
  google: "Google",
  microsoft: "Microsoft",
};

type PreviewScreen = "login" | "activate";

export function LoginPreview({ brand }: { brand: BrandConfig }) {
  const [screen, setScreen] = useState<PreviewScreen>("login");
  const copy = brandLoginCopy(brand);
  const activate = brandActivateCopy(brand);
  const initials = brandInitials(brand);

  return (
    <div
      className="overflow-hidden rounded-2xl border border-border/70 bg-background"
      style={brand.theme as React.CSSProperties}
    >
      <div className="flex items-center justify-between border-b border-border/60 bg-card/60 px-4 py-2">
        <div className="flex gap-1">
          {(
            [
              ["login", "Sign-in"],
              ["activate", "Activate"],
            ] as const
          ).map(([id, label]) => (
            <button
              key={id}
              type="button"
              onClick={() => setScreen(id)}
              className={cn(
                "rounded-md px-2 py-1 text-[10px] font-medium uppercase tracking-[0.16em] transition-colors",
                screen === id
                  ? "bg-primary/15 text-foreground"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <span className="text-[10px] text-muted-foreground">
          {brand.hosts[0] ?? "no hostname"}
          {screen === "login" ? "/login" : "/activate"}
        </span>
      </div>


      <div className="relative overflow-hidden px-6 py-8">
        <div className="pointer-events-none absolute inset-0">
          <div className="absolute -top-[20%] left-1/2 h-[60%] w-[70%] -translate-x-1/2 rounded-full bg-primary/15 blur-[90px]" />
          <div className="absolute -bottom-[20%] right-[-10%] h-[50%] w-[50%] rounded-full bg-accent/10 blur-[90px]" />
        </div>

        <div className="relative mx-auto w-full max-w-[320px] space-y-4">
          {/* Terminal */}
          <div className="rounded-xl border border-border/70 bg-card/80 p-3 font-mono text-[11px]">
            <div className="mb-2 flex gap-1.5">
              <span className="h-2 w-2 rounded-full bg-destructive/70" />
              <span className="h-2 w-2 rounded-full bg-warning/70" />
              <span className="h-2 w-2 rounded-full bg-success/70" />
            </div>
            <p className="text-muted-foreground">
              <span className="text-primary">$</span> {brand.terminalCommand}
              <span className="ml-0.5 inline-block h-3 w-1.5 translate-y-0.5 bg-primary/80" />
            </p>
          </div>

          {/* Card */}
          <div className="rounded-2xl border border-border/70 bg-card p-5 text-center shadow-lg">
            <div className="mx-auto mb-3 flex h-12 w-12 items-center justify-center overflow-hidden rounded-xl border border-ring/30 bg-card/70">
              {brand.logo.markUrl ? (
                <img
                  src={brand.logo.markUrl}
                  alt={brand.logo.alt}
                  className="h-full w-full object-contain"
                />
              ) : (
                <span className="text-sm font-semibold text-primary">{initials}</span>
              )}
            </div>

            {brand.logo.wordmarkUrl ? (
              <img
                src={brand.logo.wordmarkUrl}
                alt={brand.logo.alt}
                className="mx-auto mb-3 max-h-6 max-w-[140px] object-contain"
              />
            ) : (
              <p className="mb-3 text-sm font-semibold tracking-tight text-foreground">
                {brand.name || "Brand name"}
              </p>
            )}

            {screen === "login" ? (
              <>
                <p className="text-lg font-semibold leading-tight text-foreground">
                  {copy.headline}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {copy.subheadline}
                </p>

                <div className="mt-4 grid gap-2 text-left">
                  {brand.providers.length === 0 ? (
                    <p className="rounded-lg border border-destructive/40 bg-destructive/10 p-2 text-xs text-destructive">
                      No sign-in providers enabled — visitors cannot sign in.
                    </p>
                  ) : (
                    brand.providers.map((id, index) => (
                      <div
                        key={id}
                        className={[
                          "flex h-9 items-center justify-center rounded-lg border text-xs font-medium",
                          index === 0
                            ? "border-transparent bg-primary text-primary-foreground"
                            : "border-border bg-card/70 text-foreground",
                        ].join(" ")}
                      >
                        {`${copy.signInLabel} ${PROVIDER_NAME[id] ?? id}`.trim()}
                      </div>
                    ))
                  )}
                </div>

                {copy.signUpLabel || copy.forgotLabel ? (
                  <div className="mt-3 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-[10px]">
                    {copy.signUpLabel ? (
                      <span className="font-medium text-foreground/80 underline">
                        {copy.signUpLabel}
                      </span>
                    ) : null}
                    {copy.forgotLabel ? (
                      <span className="text-muted-foreground underline">{copy.forgotLabel}</span>
                    ) : null}
                  </div>
                ) : null}

                <p className="mt-3 text-[10px] uppercase tracking-[0.2em] text-muted-foreground/70">
                  Encrypted sign-in
                </p>
              </>
            ) : (
              <>
                <p className="text-lg font-semibold leading-tight text-foreground">
                  {activate.headline}
                </p>
                <p className="mt-1.5 text-xs leading-relaxed text-muted-foreground">
                  {activate.subheadline}
                </p>

                <div className="mt-4 rounded-xl border border-border/60 bg-muted/40 p-3 text-left">
                  <p className="text-xs font-medium text-foreground">{activate.stepsTitle}</p>
                  <ol className="mt-1.5 space-y-1 text-[10px] leading-relaxed text-muted-foreground">
                    <li>1. Open the {brand.name || "brand"} bot in Telegram.</li>
                    <li>
                      2. Send{" "}
                      <code className="rounded bg-background px-1 py-0.5 font-mono">/link</code> to
                      receive a 6-character code.
                    </li>
                    <li>3. Paste it below within 15 minutes.</li>
                  </ol>
                  <div className="mt-2 inline-flex h-7 items-center rounded-lg border border-border bg-card/70 px-2 text-[10px] font-medium text-foreground">
                    {activate.botLabel}
                  </div>
                </div>

                <div className="mt-3 flex h-9 items-center justify-center rounded-lg border border-border bg-background font-mono text-xs tracking-[0.4em] text-muted-foreground">
                  ABC123
                </div>

                <div className="mt-2 flex h-9 items-center justify-center rounded-lg border border-transparent bg-primary text-xs font-medium text-primary-foreground">
                  {activate.submitLabel}
                </div>

                <p className="mt-3 text-[10px] text-muted-foreground/80">
                  On success: “{activate.successHeadline}”
                </p>
              </>
            )}
          </div>

          <p className="text-center text-[10px] text-muted-foreground">
            Lands on {brand.redirect.afterLogin} · community {brand.community.id || "—"}
          </p>

        </div>
      </div>
    </div>
  );
}
