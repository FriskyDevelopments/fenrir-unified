// TEMPORARY visual-QA harness — renders the public GatePreview with a static
// config so the cinematic shell can be screenshot without a live Neon gate.
// Safe to delete; not linked from anywhere.
import { createFileRoute } from "@tanstack/react-router";
import { GatePreview } from "@/components/gate/gate-preview";
import type { GateConfig } from "@/lib/gate-presets";

export const Route = createFileRoute("/zz-gate-harness")({
  component: Harness,
});

// Empty rules_text / disclaimer_text on purpose: proves the fallback copy path
// (a legacy blank record must still show Rules + "Before you enter").
const CONFIG: GateConfig = {
  slug: "barra-vieja",
  brand_id: "myfenrir",
  preset: "fenrir-dark",
  headline: "The Pack — Barra Vieja",
  subheadline: "A private entrance for members and invited guests. Verify, then continue.",
  logo_url: null,
  mascot_url: null,
  background_url: null,
  rules_text: "",
  disclaimer_text: "",
  policy_version: 1,
};

function Harness() {
  return <GatePreview config={CONFIG} />;
}
