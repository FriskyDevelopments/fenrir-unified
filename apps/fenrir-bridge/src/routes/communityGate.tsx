import { useEffect, useMemo, useState } from "react";
import { copy, type Copy, type Locale } from "../i18n";
import { AuthSurface } from "../components/AuthSurface";
import { GlowCard } from "../components/GlowCard";
import { brandThemes } from "../theme/brandThemes";
import {
  getCommunityAuthBrandForAdmin,
  getCommunityAuthProposal,
  getCommunityBrand,
  saveCommunityBrand,
  CommunityBrandRequestError,
  type CommunityAuthProposal,
  type CommunityBrandPayload,
  type CommunityBrandUpdatePayload,
  type DefaultAccessState
} from "../services/communityAuth";
import type { UiCopy } from "../app/uiCopy";
import { communityBridgeDashboardUrl } from "../services/communityBridge";
import { PanelTitle } from "./routeCommon";

function mergeNeonBrandTheme(base: typeof brandThemes.neonNexus, brand: CommunityBrandPayload | null) {
  if (!brand) return base;
  return {
    ...base,
    productName: brand.name || base.productName,
    headline: brand.headline || base.headline,
    subheadline: brand.subheadline || base.subheadline,
    primary: brand.primary_color || base.primary,
    secondary: brand.secondary_color || base.secondary,
    accent: brand.accent_color || base.accent
  };
}

const brandWizardSteps = ["Address", "Name", "Images", "Colors", "Words", "Access"] as const;
type BrandWizardStep = (typeof brandWizardSteps)[number];

const brandWizardStepDetails: Record<BrandWizardStep, { title: string; body: string; outcome: string }> = {
  Address: {
    title: "Choose the public address",
    body: "This becomes the short URL people visit before they ask to join.",
    outcome: "Visitors will land on this route."
  },
  Name: {
    title: "Name the community",
    body: "Use the name members already recognize. This is the main label on the gate.",
    outcome: "The preview headline and dashboard listing use this name."
  },
  Images: {
    title: "Add logo and atmosphere",
    body: "Start with a preset, then replace assets later when the final brand files are ready.",
    outcome: "Logo, mascot, and background affect the public gate."
  },
  Colors: {
    title: "Pick the visual mood",
    body: "Choose three colors: primary for action, secondary for support, accent for highlights.",
    outcome: "Buttons, badges, and glow states follow these colors."
  },
  Words: {
    title: "Write the welcome message",
    body: "Say who the gate is for and what happens after people enter.",
    outcome: "These lines are what visitors read before signing in."
  },
  Access: {
    title: "Set the entry rules",
    body: "Decide whether people enter immediately, need an invite, or wait for review.",
    outcome: "Neon stores the membership state and audit trail."
  }
};

const accessStateHelp: Record<DefaultAccessState, string> = {
  provisional: "New members wait for review before full access.",
  open: "Approved identity can enter immediately.",
  invite_only: "Only people with a valid invite code can proceed.",
  disabled: "The gate stays closed while you finish setup."
};

function communityAuthProviderLabel(provider: string) {
  if (provider === "magic_link") return "Magic link";
  return provider[0]?.toUpperCase() + provider.slice(1);
}

const legacyNeonPromoAsset = "/mj-neon-hero.gif";

function cleanCommunityAssetUrl(value?: string | null) {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return trimmed.includes(legacyNeonPromoAsset) ? null : trimmed;
}

const brandImageFields = [
  {
    key: "logo_url",
    icon: "◇",
    title: "Logo mark",
    placeholder: "/fenrir-cut-wordmark.svg",
    help: "Use an SVG/PNG in /public, Cloudflare R2, or another public HTTPS URL. This appears in the gate header."
  },
  {
    key: "mascot_url",
    icon: "✦",
    title: "Mascot or product visual",
    placeholder: "https://cdn.example.com/community-mascot.png",
    help: "Optional. Add a character, product shot, or community symbol. Leave blank for a cleaner gate."
  },
  {
    key: "background_url",
    icon: "▣",
    title: "Background image",
    placeholder: "https://cdn.example.com/community-background.jpg",
    help: "Use a wide high-contrast image. The gate adds a dark overlay automatically."
  }
] as const;

const brandStylePresets = [
  { name: "Neon Nexus", primary: "#22c7a8", secondary: "#8cb9ff", accent: "#9b8cff", note: "Electric teal, blue, violet." },
  { name: "Fenrir Core", primary: "#ff334e", secondary: "#22c7a8", accent: "#f1b75c", note: "Red action, teal signal, amber highlight." },
  { name: "Midnight Ops", primary: "#111111", secondary: "#666666", accent: "#c9d1d9", note: "Quiet operator mode." },
  { name: "Solar Gate", primary: "#f59e0b", secondary: "#fb7185", accent: "#22d3ee", note: "Warm launch page with cyan edge." },
  { name: "Arcade Pulse", primary: "#a855f7", secondary: "#06b6d4", accent: "#f472b6", note: "More playful, obvious community flavor." }
] as const;

const communityGateWalkthrough = [
  {
    label: "What it is",
    title: "A branded front door before Neon decides access.",
    body: "Visitors land on your public community gate, see your brand, prove identity, and then Neon checks whether they can enter."
  },
  {
    label: "How to set it",
    title: "Pick address, brand, words, login methods, and access mode.",
    body: "The builder walks through the slug, name, logo/background, colors, welcome copy, and rules like provisional, open, invite-only, or disabled."
  },
  {
    label: "How it works",
    title: "Fenrir handles the door. Neon keeps the member state.",
    body: "Fenrir renders the gate and routes the flow. Neon stores membership, invite state, review status, and audit history away from Fenrir Bridge customer data."
  },
  {
    label: "Why subscribe",
    title: "You get a real community access system, not another loose link.",
    body: "Subscription unlocks branded gates, safer onboarding, isolated community records, review workflows, and a cleaner upgrade path for paid/private communities."
  }
] as const;

/**
 * The Community Bridge is its OWN product surface (apps/community-bridge,
 * Neon-based, deployed apart at gate.myfenrir.com). The main MyFenrir
 * dashboard only hands off to it — the embedded brand wizard was retired
 * from this surface on purpose.
 */
export function CommunityBridgeHandoffPanel() {
  return (
    <section className="panel wide community-bridge-handoff" aria-label="Community Bridge">
      <div className="panel-title">
        <div>
          <h3>Community Bridge</h3>
          <p>Gates, branding, invites and member state live in their own app — Neon-backed, separate from this dashboard.</p>
        </div>
        <span className="status good">Separate surface</span>
      </div>
      <div className="community-bridge-handoff-body">
        <p>
          Build and manage your community gates in the Community Bridge dashboard.
          Fenrir keeps the door; Neon keeps the member state.
        </p>
        <div className="community-bridge-handoff-actions">
          <a className="button-link" href={communityBridgeDashboardUrl}>Open Community Bridge →</a>
        </div>
      </div>
    </section>
  );
}

export function CommunityBrandWizardPanel({ locale, onNotice }: { locale: Locale; onNotice: (message: string) => void }) {
  const [step, setStep] = useState<BrandWizardStep>("Address");
  const [slug, setSlug] = useState("neon-nexus");
  const [draft, setDraft] = useState<CommunityBrandUpdatePayload>({});
  const [loadedBrand, setLoadedBrand] = useState<CommunityBrandPayload | null>(null);
  const [authorizationReason, setAuthorizationReason] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const previewBrand = useMemo<CommunityBrandPayload>(() => ({
    slug,
    name: draft.name ?? loadedBrand?.name ?? "Neon Nexus",
    logo_url: cleanCommunityAssetUrl(draft.logo_url ?? loadedBrand?.logo_url),
    mascot_url: cleanCommunityAssetUrl(draft.mascot_url ?? loadedBrand?.mascot_url),
    background_url: cleanCommunityAssetUrl(draft.background_url ?? loadedBrand?.background_url),
    primary_color: draft.primary_color ?? loadedBrand?.primary_color ?? brandThemes.neonNexus.primary,
    secondary_color: draft.secondary_color ?? loadedBrand?.secondary_color ?? brandThemes.neonNexus.secondary,
    accent_color: draft.accent_color ?? loadedBrand?.accent_color ?? brandThemes.neonNexus.accent,
    headline: draft.headline ?? loadedBrand?.headline ?? brandThemes.neonNexus.headline,
    subheadline: draft.subheadline ?? loadedBrand?.subheadline ?? brandThemes.neonNexus.subheadline,
    invite_prefix: draft.invite_prefix ?? loadedBrand?.invite_prefix ?? slug,
    enabled_auth_providers: Array.isArray(draft.enabled_auth_providers)
      ? (draft.enabled_auth_providers as string[])
      : loadedBrand?.enabled_auth_providers ?? ["magic_link"],
    default_access_state: (draft.default_access_state ?? loadedBrand?.default_access_state ?? "provisional") as DefaultAccessState,
    communityOrgId: loadedBrand?.communityOrgId ?? null,
    communityId: loadedBrand?.communityId ?? "",
    fallbackUsed: loadedBrand?.fallbackUsed ?? false
  }), [draft, loadedBrand, slug]);

  const previewTheme = useMemo(() => mergeNeonBrandTheme(brandThemes.neonNexus, previewBrand), [previewBrand]);

  useEffect(() => {
    let cancelled = false;
    const normalized = slug.trim().toLowerCase();
    if (!normalized) return undefined;
    setBusy(true);
    setLoadError(null);
    void getCommunityAuthBrandForAdmin(normalized).then((result) => {
      if (cancelled) return;
      setLoadedBrand(result.brand);
      setAuthorizationReason(result.authorization.reason);
      setDraft({
        name: result.brand.name,
        logo_url: cleanCommunityAssetUrl(result.brand.logo_url),
        mascot_url: cleanCommunityAssetUrl(result.brand.mascot_url),
        background_url: cleanCommunityAssetUrl(result.brand.background_url),
        primary_color: result.brand.primary_color,
        secondary_color: result.brand.secondary_color,
        accent_color: result.brand.accent_color,
        headline: result.brand.headline,
        subheadline: result.brand.subheadline,
        invite_prefix: result.brand.invite_prefix,
        enabled_auth_providers: result.brand.enabled_auth_providers,
        default_access_state: result.brand.default_access_state
      });
    }).catch((error) => {
      if (cancelled) return;
      setLoadError(communityBrandAdminErrorMessage(error));
      setLoadedBrand(null);
      setAuthorizationReason(null);
    }).finally(() => {
      if (!cancelled) setBusy(false);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function saveBrand() {
    const normalized = slug.trim().toLowerCase();
    if (!normalized) {
      onNotice("Enter a valid community slug before saving.");
      return;
    }
    setBusy(true);
    const saved = await saveCommunityBrand(normalized, draft);
    setBusy(false);
    if (!saved) {
      onNotice("Brand save failed. Phase 0 requires an internal admin override.");
      return;
    }
    setLoadedBrand(saved.brand);
    setAuthorizationReason(saved.authorization.reason);
    onNotice(`Brand saved for /${normalized} (${saved.authorization.reason}).`);
  }

  const stepIndex = brandWizardSteps.indexOf(step);
  const stepDetail = brandWizardStepDetails[step];
  const selectedProviders = previewBrand.enabled_auth_providers.map(communityAuthProviderLabel).join(", ");
  const publicGatePath = `/community/${slug.trim().toLowerCase() || "your-community"}`;

  return (
    <section className="panel wide community-brand-wizard">
      <PanelTitle title="Community Gate Builder" subtitle="Customize the public gate people use before Neon decides access." />
      <div className="community-gate-walkthrough" aria-label="Community Gate walkthrough">
        <div className="community-gate-walkthrough-head">
          <span className="status good">Community Gate walkthrough</span>
          <h3>How the gate protects and grows the community.</h3>
          <p>
            Use this before styling: it explains the setup, the access flow, the subscription value,
            and what Neon owns behind the scenes.
          </p>
        </div>
        <div className="community-gate-walkthrough-grid">
          {communityGateWalkthrough.map((item, index) => (
            <article key={item.label}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <b>{item.label}</b>
              <h4>{item.title}</h4>
              <p>{item.body}</p>
            </article>
          ))}
        </div>
        <div className="community-gate-flow" aria-label="Community Gate access flow">
          {[
            "Visitor opens branded gate",
            "Identity proof",
            "Neon membership check",
            "Approve, review, or block",
            "Audit trail stays separate"
          ].map((item, index) => (
            <span key={item}>{index + 1}. {item}</span>
          ))}
        </div>
        <div className="community-gate-wow" aria-label="Community Gate subscription value">
          <div>
            <span>Gate</span>
            <b>Branded entry</b>
            <small>Logo, colors, copy, and trusted login in one public URL.</small>
          </div>
          <div>
            <span>Neon</span>
            <b>Member truth</b>
            <small>Membership, invite status, review state, and audit history stay isolated.</small>
          </div>
          <div>
            <span>Subscribe</span>
            <b>Paid community ready</b>
            <small>Unlock private gates, review workflows, safer onboarding, and upgrade paths.</small>
          </div>
        </div>
      </div>
      <div className="brand-wizard-layout">
        <div className="brand-wizard-main">
          <div className="brand-wizard-overview" aria-label="Current Community Gate setup">
            <div>
              <span>Public gate</span>
              <b>{publicGatePath}</b>
            </div>
            <div>
              <span>Entry mode</span>
              <b>{previewBrand.default_access_state.replace("_", " ")}</b>
            </div>
            <div>
              <span>Login methods</span>
              <b>{selectedProviders || "Magic link"}</b>
            </div>
          </div>

          <ol className="brand-wizard-stepper" aria-label="Brand wizard steps">
            {brandWizardSteps.map((label, index) => (
              <li key={label}>
                <button
                  type="button"
                  className={step === label ? "active" : index < stepIndex ? "done" : ""}
                  onClick={() => setStep(label)}
                >
                  <span>{index + 1}</span>
                  <b>{label}</b>
                </button>
              </li>
            ))}
          </ol>

          {loadError ? <p className="muted brand-wizard-error">{loadError}</p> : null}
          {authorizationReason ? <p className="muted">Authorization: {authorizationReason}</p> : null}

          <div className="brand-wizard-step-header">
            <span>Step {stepIndex + 1} of {brandWizardSteps.length}</span>
            <h3>{stepDetail.title}</h3>
            <p>{stepDetail.body}</p>
            <small>{stepDetail.outcome}</small>
          </div>

          {step === "Address" && (
            <label className="brand-wizard-field">
              <span>Short URL name</span>
              <input value={slug} onChange={(event) => setSlug(event.target.value)} placeholder="neon-nexus" />
              <small>Use lowercase letters, numbers, and dashes. This creates {publicGatePath}.</small>
            </label>
          )}

          {step === "Name" && (
            <label className="brand-wizard-field">
              <span>Community name</span>
              <input value={draft.name ?? ""} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="Neon Nexus" />
              <small>This is the name visitors see on the gate and admins see in the brand workspace.</small>
            </label>
          )}

          {step === "Images" && (
            <div className="brand-wizard-image-builder">
              <div className="brand-asset-help-card">
                <span className="brand-asset-help-icon">＋</span>
                <div>
                  <b>Add your own art</b>
                  <small>Upload the file to /public, Cloudflare R2, Supabase Storage, or any public HTTPS CDN. Then paste that final URL below. Local files cannot be served to visitors until they are hosted.</small>
                </div>
              </div>
              <div className="brand-asset-grid">
                {brandImageFields.map((field) => {
                  const value = String(draft[field.key] ?? "");
                  return (
                    <label className={value ? "brand-asset-card filled" : "brand-asset-card"} key={field.key}>
                      <span className="brand-asset-icon">{field.icon}</span>
                      <span className="brand-asset-copy">
                        <b>{field.title}</b>
                        <small>{field.help}</small>
                      </span>
                      <input
                        value={value}
                        onChange={(event) => setDraft((current) => ({ ...current, [field.key]: event.target.value || null }))}
                        placeholder={field.placeholder}
                      />
                    </label>
                  );
                })}
              </div>
              <div className="brand-wizard-suggestions brand-asset-actions">
                <span>Quick art actions</span>
                <div>
                  <button type="button" className="compact-button ghost" onClick={() => setDraft(c => ({ ...c, logo_url: "/fenrir-cut-wordmark.svg", mascot_url: null, background_url: null }))}>Use clean Fenrir mark</button>
                  <button type="button" className="compact-button ghost" onClick={() => setDraft(c => ({ ...c, logo_url: "/fenrir-splash-icon.svg", mascot_url: null, background_url: "https://images.unsplash.com/photo-1614850523296-d8c1af93d400?q=80&w=2070&auto=format&fit=crop" }))}>Abstract background</button>
                  <button type="button" className="compact-button ghost" onClick={() => setDraft(c => ({ ...c, logo_url: null, mascot_url: null, background_url: null }))}>Clear all images</button>
                </div>
              </div>
            </div>
          )}

          {step === "Colors" && (
            <div className="brand-wizard-color-grid">
              <div className="brand-style-preset-grid">
                {brandStylePresets.map((preset) => (
                  <button
                    type="button"
                    className="brand-style-preset"
                    key={preset.name}
                    onClick={() => setDraft(c => ({ ...c, primary_color: preset.primary, secondary_color: preset.secondary, accent_color: preset.accent }))}
                  >
                    <span className="brand-style-swatches" aria-hidden="true">
                      <i style={{ background: preset.primary }} />
                      <i style={{ background: preset.secondary }} />
                      <i style={{ background: preset.accent }} />
                    </span>
                    <b>{preset.name}</b>
                    <small>{preset.note}</small>
                  </button>
                ))}
              </div>
              {(["primary_color", "secondary_color", "accent_color"] as const).map((key) => (
                <label className="brand-wizard-color" key={key}>
                  <span>{key.replace("_color", "")}</span>
                  <input
                    type="color"
                    value={String(draft[key] ?? previewBrand[key])}
                    onChange={(event) => setDraft((current) => ({ ...current, [key]: event.target.value }))}
                  />
                  <code>{String(draft[key] ?? previewBrand[key])}</code>
                </label>
              ))}
            </div>
          )}

          {step === "Words" && (
            <div className="brand-wizard-grid">
              <label className="brand-wizard-field">
                <span>Main welcome line</span>
                <input value={draft.headline ?? ""} onChange={(event) => setDraft((current) => ({ ...current, headline: event.target.value }))} placeholder="Enter Neon Nexus" />
                <small>Keep it short. This is the first thing visitors read.</small>
              </label>
              <label className="brand-wizard-field">
                <span>What happens here</span>
                <textarea value={draft.subheadline ?? ""} onChange={(event) => setDraft((current) => ({ ...current, subheadline: event.target.value }))} rows={3} placeholder="Verify your identity and request access to the community." />
                <small>Explain the next step without mentioning internal systems.</small>
              </label>
              <label className="brand-wizard-field">
                <span>Invite code prefix</span>
                <input value={draft.invite_prefix ?? ""} onChange={(event) => setDraft((current) => ({ ...current, invite_prefix: event.target.value }))} placeholder={slug} />
                <small>Useful when generating codes like {slug.toUpperCase()}-FOUNDERS-001.</small>
              </label>
              <div className="brand-wizard-note">
                <b>Optional promo layer</b>
                <span>Remotion can render a teaser later, but this gate should work without video.</span>
              </div>
            </div>
          )}

          {step === "Access" && (
            <div className="brand-wizard-grid">
              <label className="brand-wizard-field">
                <span>Default access state</span>
                <select
                  value={draft.default_access_state ?? previewBrand.default_access_state}
                  onChange={(event) => setDraft((current) => ({ ...current, default_access_state: event.target.value as DefaultAccessState }))}
                >
                  <option value="provisional">Provisional (Manual Review)</option>
                  <option value="open">Open (Instant Access)</option>
                  <option value="invite_only">Invite only (Private)</option>
                  <option value="disabled">Disabled (Gate Closed)</option>
                </select>
                <small>{accessStateHelp[(draft.default_access_state ?? previewBrand.default_access_state) as DefaultAccessState]}</small>
              </label>
              <div className="brand-wizard-field">
                <span>Login methods</span>
                <div className="brand-wizard-provider-grid">
                  {["magic_link", "google", "apple", "microsoft"].map((provider) => {
                    const providers = Array.isArray(draft.enabled_auth_providers) ? draft.enabled_auth_providers : (previewBrand.enabled_auth_providers || []);
                    const checked = providers.includes(provider);
                    const live = provider === "magic_link";
                    return (
                      <label className={live ? "live" : "planned"} key={provider}>
                        <input
                          type="checkbox"
                          checked={checked}
                          disabled={!live}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? [...providers, provider]
                              : providers.filter((p: string) => p !== provider);
                            setDraft((current) => ({
                              ...current,
                              enabled_auth_providers: next.length > 0 ? next : ["magic_link"]
                            }));
                          }}
                        />
                        <span>{communityAuthProviderLabel(provider)}</span>
                        <small>{live ? "Live now" : "Requires OAuth bridge"}</small>
                      </label>
                    );
                  })}
                </div>
                <small>Magic link is the live Community Gate method today. OAuth providers stay visible as planned options until their Neon session bridge is wired.</small>
              </div>
            </div>
          )}

          <div className="brand-wizard-actions">
            <button type="button" className="secondary" disabled={stepIndex === 0} onClick={() => setStep(brandWizardSteps[Math.max(0, stepIndex - 1)]!)}>
              Back
            </button>
            {stepIndex < brandWizardSteps.length - 1 ? (
              <button type="button" onClick={() => setStep(brandWizardSteps[stepIndex + 1]!)}>
                Continue to {brandWizardSteps[stepIndex + 1]}
              </button>
            ) : (
              <button type="button" disabled={busy} onClick={() => void saveBrand()}>
                {busy ? "Saving..." : "Save Community Gate"}
              </button>
            )}
          </div>
        </div>

        <aside className="brand-wizard-preview" aria-label="Public gate preview">
          <AuthSurface
            theme={previewTheme}
            locale={locale}
            onLocale={() => {}}
            railLabel="Preview"
            logoUrl={previewBrand.logo_url}
            backgroundUrl={previewBrand.background_url}
          >
            <GlowCard className="auth-card" aria-label="Community gate preview">
              <div className="auth-card-header">
                <span className="status good">Preview</span>
                <span className="auth-card-kicker">/{slug}</span>
              </div>
              <h2 className="auth-enter-title">
                <span>{previewBrand.headline}</span>
              </h2>
              <p className="muted">{previewBrand.subheadline}</p>
              <div className="brand-wizard-preview-style" aria-label="Selected visual style">
                <span style={{ background: previewBrand.primary_color }} />
                <span style={{ background: previewBrand.secondary_color }} />
                <span style={{ background: previewBrand.accent_color }} />
              </div>
              <div className="brand-wizard-preview-meta">
                <span>{previewBrand.default_access_state.replace("_", " ")}</span>
                <span>{selectedProviders || "Magic link"}</span>
              </div>
            </GlowCard>
          </AuthSurface>
        </aside>
      </div>
    </section>
  );
}

export function CommunityNeonGateRoute({ slug, locale, onLocale, c, ui }: {
  slug: string;
  locale: Locale;
  onLocale: (locale: Locale) => void;
  c: Copy;
  ui: UiCopy;
}) {
  type GateMessageTone = "info" | "success" | "error";
  const [brand, setBrand] = useState<CommunityBrandPayload | null>(null);
  const theme = useMemo(() => mergeNeonBrandTheme(brandThemes.neonNexus, brand), [brand]);
  const [proposal, setProposal] = useState<CommunityAuthProposal | null>(null);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [messageTone, setMessageTone] = useState<GateMessageTone>("info");
  const [devLink, setDevLink] = useState<string | null>(null);
  const trimmedEmail = email.trim();
  const communityName = brand?.name || theme.productName;
  const gateText = {
    en: {
      kicker: "Private community access",
      body: "Enter with a scoped Neon session. Fenrir keeps the client portal, invite checks, and community membership state separated.",
      stepIdentity: "Identity",
      stepIdentityBody: "Email link confirms the person.",
      stepInvite: "Invite",
      stepInviteBody: "Community rules decide the next door.",
      stepSession: "Session",
      stepSessionBody: "Access stays isolated from Frisky admin auth.",
      emailHint: "Use the email tied to your invite or membership request.",
      trustA: "No shared client-portal cookie",
      trustB: "Invite code ready",
      trustC: "Audit trail on approval"
    },
    es: {
      kicker: "Acceso privado de comunidad",
      body: "Entra con una sesion Neon separada. Fenrir mantiene aislados el portal de clientes, los invites y el estado de membresia.",
      stepIdentity: "Identidad",
      stepIdentityBody: "El enlace por email confirma a la persona.",
      stepInvite: "Invite",
      stepInviteBody: "Las reglas de comunidad deciden la siguiente puerta.",
      stepSession: "Sesion",
      stepSessionBody: "El acceso queda aislado del auth admin Frisky.",
      emailHint: "Usa el correo ligado a tu invite o solicitud.",
      trustA: "Sin cookie compartida del portal",
      trustB: "Invite listo",
      trustC: "Auditoria en aprobacion"
    },
    fr: {
      kicker: "Acces communaute privee",
      body: "Entrez avec une session Neon separee. Fenrir isole le portail client, les invitations et l'etat membre.",
      stepIdentity: "Identite",
      stepIdentityBody: "Le lien email confirme la personne.",
      stepInvite: "Invitation",
      stepInviteBody: "Les regles communaute ouvrent la prochaine porte.",
      stepSession: "Session",
      stepSessionBody: "L'acces reste isole de l'auth admin Frisky.",
      emailHint: "Utilisez l'email lie a votre invitation ou demande.",
      trustA: "Pas de cookie portail partage",
      trustB: "Invitation prete",
      trustC: "Audit a l'approbation"
    },
    de: {
      kicker: "Privater Community-Zugang",
      body: "Betritt die Community mit einer getrennten Neon-Session. Fenrir trennt Client-Portal, Einladungen und Mitgliedsstatus.",
      stepIdentity: "Identitaet",
      stepIdentityBody: "Der E-Mail-Link bestaetigt die Person.",
      stepInvite: "Einladung",
      stepInviteBody: "Community-Regeln bestimmen die naechste Tuer.",
      stepSession: "Session",
      stepSessionBody: "Der Zugang bleibt vom Frisky-Admin-Auth isoliert.",
      emailHint: "Nutze die E-Mail deiner Einladung oder Anfrage.",
      trustA: "Kein geteilter Portal-Cookie",
      trustB: "Einladung bereit",
      trustC: "Audit bei Freigabe"
    }
  }[locale];

  useEffect(() => {
    let cancelled = false;
    void getCommunityAuthProposal().then((next) => {
      if (!cancelled) setProposal(next);
    });
    void getCommunityBrand(slug).then((next) => {
      if (!cancelled) setBrand(next);
    });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  async function requestLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage(null);
    setMessageTone("info");
    setDevLink(null);
    try {
      const response = await fetch("/api/community-auth/magic-link/request", {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail, slug })
      });
      const body = await response.json().catch(() => null) as { message?: string; devLink?: string; error?: string; detail?: string | { message?: string } } | null;
      if (!response.ok) throw new Error(readableCommunityError(body?.detail, body?.error));
      setMessage(body?.message || ui.neonMagicSuccessMessage);
      setMessageTone("success");
      setDevLink(body?.devLink || null);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : ui.neonMagicBusy);
      setMessageTone("error");
    } finally {
      setBusy(false);
    }
  }

  return (
    <AuthSurface
      theme={theme}
      locale={locale}
      onLocale={onLocale}
      railLabel="Community Gate scope"
      logoUrl={brand?.logo_url}
      backgroundUrl={cleanCommunityAssetUrl(brand?.background_url)}
    >
        <GlowCard className="auth-card" aria-label="Fenrir Community Gate auth">
          <div className="auth-card-header">
            <span className="status good">Community Gate</span>
            <span className="auth-card-kicker">/{slug}</span>
          </div>
          <div className="community-gate-intro">
            <p className="label">{gateText.kicker}</p>
            <h2 className="auth-enter-title" data-text={communityName}>
              <span>{communityName}</span>
            </h2>
            <p>{gateText.body}</p>
          </div>
          <CommunityAuthProposalPanel proposal={proposal} locale={locale} />
          {vercelPreviewWithoutApi ? (
            <div className="auth-disclosure community-preview-warning" role="status">
              <div>
                <b>Preview mode</b>
                <small>API actions are disabled on this Vercel preview so it cannot write to production Community Gate data.</small>
              </div>
              <span className="status amber">Safe preview</span>
            </div>
          ) : null}
          <div className="community-gate-steps" aria-label="Community access steps">
            <section>
              <b>01</b>
              <span>{gateText.stepIdentity}</span>
              <small>{gateText.stepIdentityBody}</small>
            </section>
            <section>
              <b>02</b>
              <span>{gateText.stepInvite}</span>
              <small>{gateText.stepInviteBody}</small>
            </section>
            <section>
              <b>03</b>
              <span>{gateText.stepSession}</span>
              <small>{gateText.stepSessionBody}</small>
            </section>
          </div>
          <form className="community-auth-form" onSubmit={requestLink}>
            <label>
              <span>{c.serviceEmail}</span>
              <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required placeholder={ui.communityEmailPlaceholder} autoComplete="email" />
              <small>{gateText.emailHint}</small>
            </label>
            <button className="apple-auth-button community-submit-button" type="submit" disabled={busy || !trimmedEmail}>
              {busy ? ui.neonMagicBusy : ui.neonMagicButton}
            </button>
          </form>
          {message ? <small className={`community-auth-message ${messageTone}`} role="status">{message}</small> : null}
          {devLink ? <a className="button-link ghost community-dev-link" href={devLink}>{ui.neonMagicDevLinkLabel}</a> : null}
          <div className="community-trust-strip" aria-label="Community gate assurances">
            <span>{gateText.trustA}</span>
            <span>{gateText.trustB}</span>
            <span>{gateText.trustC}</span>
          </div>
        </GlowCard>
    </AuthSurface>
  );
}