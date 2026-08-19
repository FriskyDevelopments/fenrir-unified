import { useState, type CSSProperties } from "react";
import { communityBridgeDashboardUrl } from "../services/communityBridge";
import "./wow-mvp.css";

type PresetId = "fenrir-dark" | "lore-neon" | "aurora-mint";

const presets: Record<PresetId, { name: string; tagline: string; accent: string; atmosphere: string; icon: "paw" | "ghost" | "wave" }> = {
  "fenrir-dark": {
    name: "Fenrir dark", tagline: "Deep navy with ember red", accent: "oklch(0.637 0.208 25.3)", icon: "paw",
    atmosphere: "radial-gradient(ellipse 65% 50% at 50% 0%, oklch(0.637 0.208 25.3 / 30%), transparent 70%), radial-gradient(ellipse 55% 45% at 90% 100%, oklch(0.723 0.192 149.6 / 20%), transparent 72%), linear-gradient(180deg, oklch(0.19 0.035 262), oklch(0.149 0.017 259.9))"
  },
  "lore-neon": {
    name: "LORE neon", tagline: "Electric, high-contrast glow", accent: "oklch(0.70 0.21 320)", icon: "ghost",
    atmosphere: "radial-gradient(ellipse 70% 55% at 50% 0%, oklch(0.62 0.24 320 / 45%), transparent 70%), radial-gradient(ellipse 60% 50% at 15% 100%, oklch(0.70 0.19 200 / 38%), transparent 72%), linear-gradient(180deg, oklch(0.17 0.05 285), oklch(0.12 0.03 275))"
  },
  "aurora-mint": {
    name: "Aurora mint", tagline: "Cool teal, fresh and calm", accent: "oklch(0.76 0.15 170)", icon: "wave",
    atmosphere: "radial-gradient(ellipse 75% 55% at 20% 0%, oklch(0.75 0.16 170 / 38%), transparent 70%), radial-gradient(ellipse 60% 50% at 85% 90%, oklch(0.66 0.15 235 / 34%), transparent 72%), linear-gradient(180deg, oklch(0.18 0.03 200), oklch(0.13 0.02 210))"
  }
};

function LineIcon({ name }: { name: "shield" | "sparkle" | "bolt" | "paw" | "ghost" | "wave" | "arrow" }) {
  const paths = {
    shield: <><path d="M12 3 5 6v5c0 4.7 2.8 8.4 7 10 4.2-1.6 7-5.3 7-10V6l-7-3Z"/><path d="m9 12 2 2 4-5"/></>,
    sparkle: <><path d="m12 3 1.4 4.1L17.5 8.5l-4.1 1.4L12 14l-1.4-4.1-4.1-1.4 4.1-1.4L12 3Z"/><path d="m18 15 .7 2.3L21 18l-2.3.7L18 21l-.7-2.3L15 18l2.3-.7L18 15Z"/></>,
    bolt: <path d="m13 2-8 12h7l-1 8 8-12h-7l1-8Z"/>,
    paw: <><circle cx="8" cy="8" r="2"/><circle cx="16" cy="8" r="2"/><circle cx="5" cy="13" r="1.7"/><circle cx="19" cy="13" r="1.7"/><path d="M8 18c0-2.3 1.8-4 4-4s4 1.7 4 4c0 1.7-1.8 3-4 3s-4-1.3-4-3Z"/></>,
    ghost: <path d="M6 21V10a6 6 0 0 1 12 0v11l-3-2-3 2-3-2-3 2Z"/>,
    wave: <><path d="M3 12c2.2-3 4.5-3 6.8 0s4.6 3 6.9 0 4.5-3 6.3-.7"/><path d="M3 17c2.2-3 4.5-3 6.8 0s4.6 3 6.9 0 4.5-3 6.3-.7"/></>,
    arrow: <><path d="M5 12h14"/><path d="m14 7 5 5-5 5"/></>
  };
  return <svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">{paths[name]}</svg>;
}

function BrandLockup({ compact = false }: { compact?: boolean }) {
  return <span className={`cb-lockup ${compact ? "cb-lockup--compact" : ""}`}><i><LineIcon name="shield" /></i><b>MYFENRIR<small>COMMUNITY BRIDGE</small></b></span>;
}

function GatePreview({ presetId, name }: { presetId: PresetId; name: string }) {
  const preset = presets[presetId];
  return (
    <div className="cb-gate" style={{ background: preset.atmosphere }}>
      <div className="cb-gate__aurora" />
      <div className="cb-gate__content">
        <BrandLockup />
        <div className="cb-gate__mascot" style={{ color: preset.accent, boxShadow: `0 0 40px -8px ${preset.accent}`, background: `color-mix(in oklab, ${preset.accent} 14%, transparent)` }}><LineIcon name={preset.icon} /></div>
        <div><h3>{name.trim() || "Members only"}</h3><p>Sign in to continue to the community portal.</p></div>
        <button type="button" style={{ background: `color-mix(in oklab, ${preset.accent} 85%, black)`, boxShadow: `0 0 40px -10px ${preset.accent}` }}>Continue with single sign-on</button>
        <small>SECURED · END-TO-END ENCRYPTED</small>
      </div>
    </div>
  );
}

export function WowMvpRoute() {
  const [preset, setPreset] = useState<PresetId>("fenrir-dark");
  const [gateName, setGateName] = useState("The Night Pack");
  const [pulse, setPulse] = useState(0);
  const currentPreset = presets[preset];
  const worldStyle = { "--cb-accent": currentPreset.accent } as CSSProperties;

  return (
    <main className={`cb-wow cb-wow--${preset}`} style={worldStyle}>
      <div className="cb-world" aria-hidden="true" key={preset} style={{ background: currentPreset.atmosphere }} />
      <div className="cb-wow__cosmic" aria-hidden="true" />
      <header className="cb-header">
        <a href="/" aria-label="MyFenrir home"><BrandLockup compact /></a>
        <div><span>Visual lab</span><a href={communityBridgeDashboardUrl}>Create a real gate <LineIcon name="arrow" /></a></div>
      </header>

      <section className="cb-hero">
        <div className="cb-hero__copy">
          <span className="cb-pill"><i /> COMMUNITY ACCESS, DESIGNED YOUR WAY</span>
          <h1>Build the gate<br />they remember.</h1>
          <p>Choose a world and watch the entire experience become your community’s front door.</p>
          <div className="cb-hero__actions"><a className="cb-primary" href="#gate-studio">Design your gate <LineIcon name="arrow" /></a><a className="cb-secondary" href={communityBridgeDashboardUrl}>Open Community Bridge</a></div>
        </div>
        <div className="cb-hero__live">
          <div className="cb-hero__gate" style={{ background: currentPreset.atmosphere }}>
            <div className="cb-hero__gate-glow" />
            <BrandLockup />
            <div className="cb-gate__mascot" style={{ color: currentPreset.accent, boxShadow: `0 0 42px -7px ${currentPreset.accent}`, background: `color-mix(in oklab, ${currentPreset.accent} 14%, transparent)` }}><LineIcon name={currentPreset.icon} /></div>
            <h2>{gateName}</h2><p>{currentPreset.tagline}</p>
            <span>LIVE GATE / {currentPreset.name.toUpperCase()}</span>
          </div>
          <div className="cb-hero__preset-rail" aria-label="Change the world">
            {(Object.keys(presets) as PresetId[]).map((id) => <button key={id} type="button" aria-label={`Preview ${presets[id].name}`} aria-pressed={preset === id} onClick={() => setPreset(id)}><i style={{ background: presets[id].atmosphere }} /><span>{presets[id].name}</span></button>)}
          </div>
        </div>
      </section>

      <section className="cb-feature-grid" aria-label="Community access features">
        <article><div><LineIcon name="shield" /></div><span>01</span><h2>One identity</h2><p>SSO-only access keeps the front door simple and the security boundary clear.</p></article>
        <article><div><LineIcon name="bolt" /></div><span>02</span><h2>Telegram aware</h2><p>Connect once, then let community roles follow the source of truth.</p></article>
        <article><div><LineIcon name="sparkle" /></div><span>03</span><h2>Made to share</h2><p>Every Gate gets a public link, QR-ready presentation and its own atmosphere.</p></article>
      </section>

      <section className="cb-activation" id="activate-gate" aria-labelledby="activation-title">
        <div className="cb-activation__intro">
          <span className="cb-section-label">TWO PATHS · ONE SECURE GATE</span>
          <h2 id="activation-title">Activate it your way.</h2>
          <p>Both routes verify the bot’s administrator status, map one protected group to the right community, and use the bot’s private chat as the waiting room.</p>
        </div>
        <div className="cb-activation__paths">
          <article>
            <span>RECOMMENDED · GUIDED</span><i><LineIcon name="sparkle" /></i>
            <h3>From Community Bridge</h3>
            <ol><li>Open your Gate and choose its community.</li><li>Tap <b>Add bot as admin</b> and enable <b>Invite Users</b>.</li><li>Return to Telegram—the community ID is already included. Confirm and open the Gate.</li></ol>
            <a className="cb-primary" href={communityBridgeDashboardUrl}>Open Community Bridge <LineIcon name="arrow" /></a>
          </article>
          <article>
            <span>DIRECT · INSIDE TELEGRAM</span><i><LineIcon name="paw" /></i>
            <h3>From the Gatekeeper bot</h3>
            <ol><li>Add <b>@Myfenrir_bot</b> to the group and make it an administrator.</li><li>Choose your language, then choose the community from the bot.</li><li>Use <code>/setmain@Myfenrir_bot &lt;community-id&gt;</code> if you prefer manual setup; verify with <code>/readiness</code>.</li></ol>
            <a className="cb-secondary" href="https://t.me/Myfenrir_bot">Open Gatekeeper bot <LineIcon name="arrow" /></a>
          </article>
        </div>
        <p className="cb-activation__note">🐺 No extra waiting-room group is required. Candidates complete Human → Identity → Rules → Vibe privately and receive a one-person temporary invite.</p>
      </section>

      <section className="cb-studio" id="gate-studio" aria-labelledby="studio-title">
        <div className="cb-studio__controls">
          <span className="cb-section-label">GATE STUDIO · LOCAL PREVIEW</span><h2 id="studio-title">Pick a feeling.<br />See it live.</h2><p>This is the exact preset-first language of Community Bridge. Nothing here is saved or published.</p>
          <label htmlFor="cb-gate-name">Gate headline</label><input id="cb-gate-name" value={gateName} maxLength={32} onChange={(event) => setGateName(event.target.value)} />
          <fieldset><legend>Choose a preset</legend>{(Object.keys(presets) as PresetId[]).map((id) => { const item = presets[id]; return <button key={id} type="button" aria-pressed={preset === id} onClick={() => setPreset(id)}><i style={{ background: item.atmosphere }} /><span><b>{item.name}</b><small>{item.tagline}</small></span><em>{preset === id ? "Selected" : "Preview"}</em></button>; })}</fieldset>
          <a className="cb-primary cb-primary--wide" href={communityBridgeDashboardUrl}>Create this Gate in Community Bridge <LineIcon name="arrow" /></a>
        </div>
        <div className="cb-studio__preview"><div className="cb-preview-label"><span>LIVE PREVIEW</span><b>{presets[preset].name}</b></div><GatePreview presetId={preset} name={gateName} /></div>
      </section>

      <section className="cb-pulse" aria-labelledby="pulse-title">
        <div><span className="cb-section-label">ACCESS PULSE · DEMO</span><h2 id="pulse-title">A calm view of<br />every boundary.</h2><p>Illustrative states only—never fake account status. Real identity and access decisions stay server-authorized.</p></div>
        <div className="cb-pulse__card">
          <header><div><span>Gate readiness</span><strong>Preview sequence</strong></div><i>DEMO</i></header>
          {["Identity signal", "Human verification", "Community handoff"].map((label, index) => <button type="button" key={label} onClick={() => setPulse(index)} className={pulse === index ? "is-active" : ""}><span>{label}<small>{index === 0 ? "Recognize the signed-in person" : index === 1 ? "Challenge only when risk requires it" : "Continue to rules and membership"}</small></span><i>{pulse === index ? "Viewing" : "Inspect"}</i></button>)}
          <div className="cb-pulse__progress"><i style={{ width: `${(pulse + 1) * 33.333}%` }} /></div>
        </div>
      </section>

      <section className="cb-final"><div className="cb-final__glow" /><span className="cb-pill">READY WHEN YOUR COMMUNITY IS</span><h2>Create the front door<br />your people remember.</h2><a className="cb-primary" href={communityBridgeDashboardUrl}>Build it in Community Bridge <LineIcon name="arrow" /></a><small>No Gate is created from this visual lab.</small></section>
      <footer className="cb-footer"><BrandLockup compact /><p>MyFenrir identity · Community Bridge access</p><a href="/">Exit visual lab</a></footer>
    </main>
  );
}
