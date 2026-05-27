import type { CSSProperties, ReactNode } from "react";
import { languageNames, locales, type Locale } from "../i18n";
import type { BrandTheme } from "../theme/brandThemes";
import { themeClassName, themeCssVars } from "../theme/brandThemes";

type AuthSurfaceProps = {
  theme: BrandTheme;
  locale: Locale;
  onLocale: (locale: Locale) => void;
  railLabel: string;
  logoUrl?: string | null;
  backgroundUrl?: string | null;
  children: ReactNode;
};

export function AuthSurface({ theme, locale, onLocale, railLabel, logoUrl, backgroundUrl, children }: AuthSurfaceProps) {
  const style = {
    ...themeCssVars(theme),
    ...(backgroundUrl ? { "--theme-bg-image": `url("${backgroundUrl}")` } : {})
  } as CSSProperties;

  return (
    <main
      className={`auth-page community-auth-surface ${themeClassName(theme)}`}
      style={style}
      data-theme={theme.key}
      data-has-background={backgroundUrl ? "true" : "false"}
    >
      <div className="auth-atmosphere" aria-hidden="true">
        <span className="auth-fog fog-one" />
        <span className="auth-fog fog-two" />
        <span className="auth-rune rune-one" />
        <span className="auth-rune rune-two" />
        <span className="auth-rune rune-three" />
      </div>

      <div className="auth-language-dock">
        <select className="language-select" value={locale} onChange={(event) => onLocale(event.target.value as Locale)} aria-label="Language">
          {locales.map((item) => (
            <option value={item} key={item}>{languageNames[item]}</option>
          ))}
        </select>
      </div>

      <section className="auth-shell">
        <div className="auth-hero-copy">
          {theme.heroSrc ? (
            <div className="auth-hero-visual" aria-hidden={theme.heroAlt ? undefined : true}>
              <img src={theme.heroSrc} alt={theme.heroAlt ?? ""} />
            </div>
          ) : null}
          <img className="auth-wordmark" src={logoUrl || theme.logoSrc} alt={theme.logoAlt} />
          <h1>{theme.headline}</h1>
          <p>{theme.subheadline}</p>
          <div className="protocol-rail" aria-label={railLabel}>
            <div>
              {[...theme.lanes, ...theme.lanes].map((lane, index) => (
                <span key={`${lane}-${index}`}>{lane}</span>
              ))}
            </div>
          </div>
        </div>

        {children}
      </section>
    </main>
  );
}
