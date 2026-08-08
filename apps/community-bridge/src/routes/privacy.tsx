import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/legal-page";
import { useBrand } from "@/config/brand-context";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [{ title: "Privacy Policy" }],
  }),
  component: PrivacyPage,
});

function PrivacyPage() {
  const brand = useBrand();
  return (
    <LegalPage title="Privacy Policy" updated="August 8, 2026">
      <p>
        This policy describes what the {brand.name} portal stores about you and why. The short
        version: we keep the minimum needed to run sign-in, roles and Telegram linking, and we do
        not sell your data.
      </p>
      <h2>What we store</h2>
      <p>
        When you sign in through Apple, Google or Microsoft we receive your email address and basic
        profile from the provider. We store your account id, email, portal role, your Telegram user
        id (linked as part of activating your membership), and whether staff have blocked your
        account. Gate configurations you create are stored with your account.
      </p>
      <h2>Analytics</h2>
      <p>
        We collect aggregate product analytics (page views, gate views, sign-in outcomes) to
        understand usage. Gate view counts are deduplicated with a short-lived cookie; it identifies
        a browser, not a person.
      </p>
      <h2>Who can see your data</h2>
      <p>
        Community staff (admins and owners) can see your email, role and Telegram link status in the
        staff console. Other members cannot. We share data with no third parties beyond the
        infrastructure that runs the service (hosting, database, analytics).
      </p>
      <h2>Deletion</h2>
      <p>
        Ask the {brand.name} staff to delete your account and we will remove your role row, Telegram
        link and gates. Sign-in identity stays with your provider — deleting your portal account
        does not touch your Apple, Google or Microsoft account.
      </p>
    </LegalPage>
  );
}
