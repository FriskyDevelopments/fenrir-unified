import { createFileRoute, Link } from "@tanstack/react-router";
import { BrandBadge, BrandWordmark } from "@/components/brand/brand-logo";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ArrowRight, KeyRound, ListChecks, ShieldCheck, Users } from "lucide-react";
import { getSiteUrl } from "@/config/site-url";

const URL = `${getSiteUrl()}/blog/telegram-role-management-guide`;
const TITLE = "Telegram Bot Role Management Guide";
const DESCRIPTION =
  "Link Telegram IDs to real accounts, model roles server-side, and automate group access without leaking permissions. A practical role management guide.";
const PUBLISHED = "2026-08-03";

export const Route = createFileRoute("/blog/telegram-role-management-guide")({
  head: () => ({
    meta: [
      { title: `${TITLE} — MyFenrir` },
      { name: "description", content: DESCRIPTION },
      {
        name: "keywords",
        content:
          "telegram bot role management, telegram access control, telegram account linking, telegram automation, role based access control",
      },
      { name: "author", content: "MyFenrir" },
      { property: "og:title", content: TITLE },
      { property: "og:description", content: DESCRIPTION },
      { property: "og:type", content: "article" },
      { property: "og:url", content: URL },
      { property: "article:published_time", content: PUBLISHED },
      { property: "article:section", content: "Guides" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: TITLE },
      { name: "twitter:description", content: DESCRIPTION },
    ],
    links: [{ rel: "canonical", href: URL }],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "Article",
          headline: TITLE,
          description: DESCRIPTION,
          datePublished: PUBLISHED,
          dateModified: PUBLISHED,
          articleSection: "Guides",
          inLanguage: "en",
          mainEntityOfPage: { "@type": "WebPage", "@id": URL },
          author: {
            "@type": "Organization",
            name: "MyFenrir",
            url: `${getSiteUrl()}/`,
          },
          publisher: {
            "@type": "Organization",
            name: "MyFenrir",
            url: `${getSiteUrl()}/`,
          },
        }),
      },

      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          itemListElement: [
            {
              "@type": "ListItem",
              position: 1,
              name: "MyFenrir",
              item: `${getSiteUrl()}/`,
            },
            { "@type": "ListItem", position: 2, name: TITLE, item: URL },
          ],
        }),
      },
    ],
  }),
  component: GuidePage,
});

const STEPS = [
  {
    icon: KeyRound,
    title: "1. Issue a short-lived linking code",
    body: "Never trust a Telegram ID that arrives from the client. The bot mints a single-use code tied to the chat's Telegram ID, with an expiry measured in minutes. The code is the only thing the user carries between the two systems.",
  },
  {
    icon: ShieldCheck,
    title: "2. Redeem the code behind a real login",
    body: "The user signs in to the portal with single sign-on first, then pastes the code. Redemption happens server-side: the code is looked up, checked for expiry and prior use, marked consumed, and its Telegram ID is written onto the signed-in user's row. One code, one account, no impersonation.",
  },
  {
    icon: Users,
    title: "3. Keep roles in their own table",
    body: "Store roles in a dedicated roles table keyed by user ID — never as a column on a profile the user can edit, and never in browser storage. A single security-definer helper answers 'does this user hold this role?' so both the portal and the bot ask the same question and get the same answer.",
  },
  {
    icon: ListChecks,
    title: "4. Automate from the role, not the chat",
    body: "Once identity and role live in one place, automation becomes boring in the best way: promote, restrict or remove a member in Telegram off the role record, and revoke portal access the same moment. Access changes in one system propagate to the other instead of drifting.",
  },
];

function GuidePage() {
  return (
    <div className="min-h-dvh bg-background">
      <header className="border-b border-border/60">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-5 py-5 sm:px-6">
          <Link to="/" aria-label="MyFenrir home" className="w-28">
            <BrandWordmark />
          </Link>
          <Button asChild variant="outline" size="sm">
            <Link to="/login" search={{ next: undefined }}>
              Sign in
            </Link>
          </Button>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-5 py-12 sm:px-6 sm:py-16">
        <article>
          <p className="text-[10px] font-medium uppercase tracking-[0.24em] text-muted-foreground">
            Guide · Telegram automation
          </p>
          <h1 className="mt-3 text-3xl font-semibold tracking-tight sm:text-4xl">{TITLE}</h1>
          <p className="mt-4 text-base leading-relaxed text-muted-foreground">
            Telegram is where communities actually talk, but it was never built to be your source of
            truth for who someone is or what they are allowed to do. Group admin flags are coarse,
            they live only inside one chat, and they say nothing about the account behind the
            handle. This guide covers the pattern that fixes that: pair the bot with a portal that
            owns identity and roles, and let automation follow from it.
          </p>

          <section className="mt-12">
            <h2 className="text-xl font-semibold tracking-tight">
              Why Telegram admin flags are not role management
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              A Telegram ID is a stable, useful identifier — but on its own it is an anonymous
              number. Promote someone to admin in a group and you have granted power inside that
              group only, with no audit trail, no expiry, and no link to the email, subscription or
              seat they signed up with. When the same person needs access across several chats plus
              a dashboard, hand-managed admin flags stop scaling almost immediately: someone leaves,
              and you are hunting through chats trying to remember what they held.
            </p>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              Role management means one authoritative record per person, one place to change it, and
              every surface — bot, portal, API — reading that same record.
            </p>
          </section>

          <section className="mt-12">
            <h2 className="text-xl font-semibold tracking-tight">
              The linking pattern, step by step
            </h2>
            <div className="mt-5 grid gap-4">
              {STEPS.map((step) => (
                <Card key={step.title} variant="muted" className="p-5">
                  <div className="flex items-start gap-4">
                    <span className="mt-0.5 inline-flex shrink-0 rounded-lg bg-primary/10 p-2">
                      <step.icon className="h-4 w-4 text-primary" aria-hidden="true" />
                    </span>
                    <div>
                      <h3 className="text-sm font-semibold tracking-tight">{step.title}</h3>
                      <p className="mt-1.5 text-sm leading-relaxed text-muted-foreground">
                        {step.body}
                      </p>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </section>

          <section className="mt-12">
            <h2 className="text-xl font-semibold tracking-tight">
              Mistakes that quietly become breaches
            </h2>
            <ul className="mt-3 space-y-3 text-sm leading-relaxed text-muted-foreground">
              <li>
                <strong className="text-foreground">Trusting a client-supplied ID.</strong> If a
                request can name its own Telegram ID or user ID, anyone can claim anyone. Derive
                identity from the verified session on the server and ignore whatever the payload
                says.
              </li>
              <li>
                <strong className="text-foreground">Roles stored where users can write.</strong> A
                role on an editable profile row is a privilege-escalation bug waiting to happen.
                Separate table, no self-writes.
              </li>
              <li>
                <strong className="text-foreground">Codes that never expire.</strong> A linking code
                pasted into a public chat and still valid a week later is a free account takeover.
                Short expiry plus single use.
              </li>
              <li>
                <strong className="text-foreground">Admin checks in the browser.</strong> Hiding a
                button is UX, not security. Every privileged action re-checks the role server-side.
              </li>
              <li>
                <strong className="text-foreground">No revocation path.</strong> Removing someone
                from a chat while their portal session still works is half a departure. Revoke in
                one place, everywhere.
              </li>
            </ul>
          </section>

          <section className="mt-12">
            <h2 className="text-xl font-semibold tracking-tight">
              What automation you get for free
            </h2>
            <p className="mt-3 text-sm leading-relaxed text-muted-foreground">
              With linked identities and server-side roles in place, the automation you actually
              wanted becomes straightforward: onboard a new member by role instead of by hand, gate
              a chat or a feature behind a paid tier, expire access when a subscription lapses, and
              give staff a single console that shows every member, their role and whether their
              Telegram account is linked. The bot becomes an interface to your access model rather
              than a second, divergent copy of it.
            </p>
          </section>

          <Card variant="glow" className="mt-12 p-6 text-center">
            <h2 className="text-lg font-semibold tracking-tight">Run this pattern on MyFenrir</h2>
            <p className="mx-auto mt-2 max-w-md text-sm text-muted-foreground">
              MyFenrir ships the whole flow: single sign-on, one-time Telegram linking codes, roles
              in a dedicated table, and a staff console for managing them.
            </p>
            <Button asChild variant="fenrir" className="mt-5">
              <Link to="/login" search={{ next: undefined }}>
                Get started
                <ArrowRight className="ml-2 h-4 w-4" />
              </Link>
            </Button>
          </Card>
        </article>

        <footer className="mt-14 flex justify-center border-t border-border/60 pt-8">
          <BrandBadge />
        </footer>
      </main>
    </div>
  );
}
