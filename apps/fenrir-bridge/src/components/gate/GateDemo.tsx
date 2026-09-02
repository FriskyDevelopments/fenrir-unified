import {
  ShaderBackground,
  ParticleField,
  HowlMascot,
  WolfMascot,
  BrandMark,
  StatusBadge,
  GateShell
} from ".";
import { CommunityProvider, useCommunityContext } from "./CommunityProvider";

/**
 * GateDemo — smoke-test surface for the ported Community Gate component library.
 * Renders every primitive with the active brand theme so you can eyeball it.
 */
function DemoInner() {
  const { community, theme } = useCommunityContext();
  return (
    <GateShell brandName={community?.name ?? "Fenrir"} brandSub="Community · Gate" logoSrc={community?.logoSrc} footerStatus={`brand: ${theme.key}`}>
      <div className="gate-root" style={{ minHeight: "80vh" }}>
        <ShaderBackground kind="shader" />
        <ParticleField density={42} />
        <div className="gate-panes">
          <div className="gate-visual-pane">
            <div className="gate-visual-inner">
              <div className="gate-eyebrow">protocol demo</div>
              <h1 className="gate-headline">
                <span>Secure the</span>
                <span className="gate-gradient-text">front door.</span>
              </h1>
              <p className="gate-subhead">
                Community Gate components ported into fenrir-bridge. Tokens, mascots, shaders, particles — all theme-aware.
              </p>
              <div className="gate-badges">
                <StatusBadge status="verified" />
                <StatusBadge status="pending" />
                <StatusBadge status="member" />
                <BrandMark name={community?.name ?? "F"} size={32} />
              </div>
            </div>
            <div className="gate-mascot">
              <HowlMascot />
            </div>
          </div>
          <div className="gate-auth-pane">
            <div className="gate-auth-inner gate-card" style={{ padding: 24 }}>
              <WolfMascot style={{ width: 120, marginBottom: 16 }} />
              <StatusBadge status="verified" label="demo live" />
            </div>
          </div>
        </div>
      </div>
    </GateShell>
  );
}

export default function GateDemo() {
  return (
    <CommunityProvider slug="fenrir">
      <DemoInner />
    </CommunityProvider>
  );
}
