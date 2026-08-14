import { createFileRoute } from "@tanstack/react-router";
import { ShieldCheck } from "lucide-react";

function qualityDestinationPath(raw: string | null): string {
  if (!raw || !raw.startsWith("/") || raw.startsWith("//") || raw.includes("://")) return "/dashboard";
  if (!raw.startsWith("/g/") && raw !== "/dashboard") return "/dashboard";
  return raw;
}

export const Route = createFileRoute("/auth/social")({
  ssr: false,
  validateSearch: (search) => ({ destination: qualityDestinationPath(typeof search.destination === "string" ? search.destination : null) }),
  component: SocialProviderPage,
});

const providers = [
  { id: "google", label: "Continue with Google" },
  { id: "microsoft", label: "Continue with Microsoft" },
  { id: "apple", label: "Continue with Apple" },
] as const;

function SocialProviderPage() {
  const { destination } = Route.useSearch();
  return (
    <main className="grid min-h-dvh place-items-center bg-[#070a0f] px-5 text-white">
      <section className="w-full max-w-md rounded-3xl border border-white/10 bg-white/[0.04] p-7 shadow-2xl backdrop-blur-xl">
        <div className="mb-7 flex items-center gap-3 text-emerald-300">
          <ShieldCheck className="h-5 w-5" aria-hidden="true" />
          <span className="text-xs font-medium uppercase tracking-[0.22em]">MyFenrir · Neon identity</span>
        </div>
        <h1 className="text-2xl font-semibold tracking-tight">Choose your sign-in</h1>
        <p className="mt-2 text-sm leading-6 text-white/55">Your verification is complete. Continue with an existing social account.</p>
        <div className="mt-7 grid gap-3">
          {providers.map((provider) => (
            <a key={provider.id} href={`/auth/neon-start?${new URLSearchParams({ provider: provider.id, destination })}`}
              className="rounded-2xl border border-white/12 bg-white/[0.06] px-5 py-3.5 text-center text-sm font-medium transition hover:border-emerald-300/40 hover:bg-emerald-300/10">
              {provider.label}
            </a>
          ))}
        </div>
        <p className="mt-6 text-center text-xs text-white/35">Identity and membership are stored in Neon.</p>
      </section>
    </main>
  );
}
