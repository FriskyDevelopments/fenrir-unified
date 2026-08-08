import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { useBrand } from "@/config/brand-context";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [{ title: "Terms of Service" }],
  }),
  component: TermsPage,
});

function TermsPage() {
  const brand = useBrand();
  return (
    <LegalPage title="Terms of Service" updated="August 8, 2026">
      <p>
        These terms govern your use of the {brand.name} portal — the sign-in, account, Telegram
        linking and public gate services operated by Frisky Developments ("we", "us").
      </p>
      <h2>Your account</h2>
      <p>
        You sign in with a third-party identity provider (Apple, Google or Microsoft). You are
        responsible for that account and for activity that happens through it. We may suspend
        accounts that abuse the service, attempt to bypass access controls, or disrupt the
        communities the portal fronts.
      </p>
      <h2>Telegram linking</h2>
      <p>
        The portal fronts Telegram communities, so linking your Telegram account is a required step
        to activate your membership. You link it with a one-time code from the community bot; once
        linked, your community roles follow your identity across the bot and the portal.
      </p>
      <h2>Blocking</h2>
      <p>
        Community staff may block accounts that break community rules. A blocked account loses
        access to the portal, its gates and the linked community until staff lift the block. If you
        believe you were blocked in error, contact the community staff.
      </p>
      <h2>Public gates</h2>
      <p>
        Gates you publish are visible to anyone with the link. You are responsible for the content
        of your gates. We may take down gates that contain illegal content, impersonate others, or
        are used for phishing or spam.
      </p>
      <h2>The service</h2>
      <p>
        The portal is provided "as is", without warranties. We may change or discontinue features
        with reasonable notice. Our liability is limited to the maximum extent permitted by law.
      </p>
      <h2>Contact</h2>
      <p>
        Questions about these terms: reach the {brand.name} staff through the community, or the
        contact channels published on the brand's site.
      </p>
    </LegalPage>
  );
}
