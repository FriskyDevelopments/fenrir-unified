import type { CSSProperties, ReactNode } from "react";
import { languageNames, locales, type Locale } from "../i18n";
import type { BrandTheme } from "../theme/brandThemes";
import { themeClassName, themeCssVars } from "../theme/brandThemes";
import { GateShell } from "./gate/GateShell";
import { ShaderBackground, type ShaderKind } from "./gate/ShaderBackground";
import { ParticleField } from "./gate/ParticleField";
import { WolfMascot } from "./gate/WolfMascot";
import { HowlMascot } from "./gate/HowlMascot";
import { StatusBadge } from "./gate/StatusBadge";
import { knowledgeBaseLabel, knowledgeBaseUrl } from "../services/knowledgeBase";

type AuthSurfaceProps = {
  theme: BrandTheme;
  locale: Locale;
  onLocale: (locale: Locale) => void;
  railLabel: string;
  logoUrl?: string | null;
  backgroundUrl?: string | null;
  children: ReactNode;
};

const SHADER_BY_BACKGROUND: Record<BrandTheme["background"], ShaderKind> = {
  ghost: "clouds",
  protocol: "grid",
  nexus: "shader",
  experimental: "ember"
};

/**
 * Public gate surface, rebuilt on the Community Bridge structure:
 * shader + particle + scanline background layers, protocol chrome
 * (GateShell), and the two-pane visual/auth grid from CommunityGate.jsx.
 * Props and children contract unchanged — login logic lives in `children`.
 */
export function AuthSurface({ theme, locale, onLocale, railLabel, logoUrl, backgroundUrl, children }: AuthSurfaceProps) {
  const style = {
    ...themeCssVars(theme),
    ...(backgroundUrl ? { "--theme-bg-image": `url("${backgroundUrl}")` } : {})
  } as CSSProperties;

  const headlineWords = theme.headline.split(" ");
  const headlineLead = headlineWords.slice(0, -1).join(" ");
  const headlineTail = headlineWords.slice(-1).join(" ");
  const Mascot = theme.background === "experimental" ? HowlMascot : WolfMascot;
  const mascotLabel = `${theme.productName.toUpperCase()} · PROTOCOL`;

  const topbarActions = (
    <div className="gate-topbar-actions">
      <a className="gate-btn-ghost gate-kb-link" href={knowledgeBaseUrl} target="_blank" rel="noreferrer" data-testid="kb-link">
        {knowledgeBaseLabel}
      </a>
      <select className="language-select" value={locale} onChange={(event) => onLocale(event.target.value as Locale)} aria-label="Language">
        {locales.map((item) => (
          <option value={item} key={item}>{languageNames[item]}</option>
        ))}
      </select>
    </div>
  );

  return (
    <main
      className={`gate-root ${themeClassName(theme)}`}
      style={style}
      data-theme={theme.key}
      data-has-background={backgroundUrl ? "true" : "false"}
    >
      <div className="gate-bg-layers" aria-hidden="true">
        <ShaderBackground kind={SHADER_BY_BACKGROUND[theme.background]} />
        <ParticleField density={42} />
        <div className="gate-fill scanline" />
      </div>

      <GateShell
        brandName={theme.productName}
        brandSub={`${theme.systemRole} · Gate`}
        topRight={topbarActions}
        footerLeft={mascotLabel}
      >
        <section className="gate-panes">
          <div className="gate-visual-pane" data-testid="visual-pane">
            <div className="gate-visual-inner">
              <div className="gate-eyebrow">{theme.authKicker}</div>
              <img className="gate-wordmark" src={logoUrl || theme.logoSrc} alt={theme.logoAlt} style={{ marginTop: 20 }} />
              <h1 className="gate-headline">
                {headlineLead ? <span>{headlineLead}</span> : null}
                <span className="gate-gradient-text">{headlineTail}</span>
              </h1>
              <p className="gate-subhead">{theme.subheadline}</p>

              <div className="gate-badges">
                <StatusBadge status="verified" />
                <StatusBadge status="pending" />
                <StatusBadge status="member" />
              </div>

              <div className="gate-mascot">
                <Mascot label={mascotLabel} />
              </div>
            </div>

            <div className="gate-corner bottom-left">
              <div>protocol · {theme.key}</div>
              <div>scope · {railLabel}</div>
            </div>
            <div className="gate-corner top-right" aria-label={railLabel}>
              {theme.nodeStatus.map((line) => (
                <div key={line}>// {line}</div>
              ))}
            </div>
          </div>

          <div className="gate-auth-pane">
            <div className="gate-auth-inner">
              <div className="gate-mobile-intro">
                <div className="gate-eyebrow">{theme.authKicker}</div>
                <h1 className="gate-headline">
                  <span className="gate-gradient-text">{theme.headline}</span>
                </h1>
                <p className="gate-subhead">{theme.subheadline}</p>
              </div>
              {children}
            </div>
          </div>
        </section>
      </GateShell>
    </main>
  );
}
