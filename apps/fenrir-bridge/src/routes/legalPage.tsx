import { languageNames, locales, type Copy, type Locale } from "../i18n";
import { BrandSignature } from "./routeCommon";

export function LegalPage({ c, locale, onLocale }: { c: Copy; locale: Locale; onLocale: (locale: Locale) => void }) {
  const updated = "May 7, 2026";
  return (
    <main className="legal-page">
      <section className="legal-hero">
        <a className="legal-brand" href="/">
          <img src="/fenrir-cut-wordmark.svg" alt="Fenrir" />
        </a>
        <div>
          <span className="status good">{c.legalStatus}</span>
          <h1>{c.legalTitle}</h1>
          <p>{c.legalSub}</p>
          <BrandSignature c={c} compact />
          <small>{c.lastUpdated}: {updated}</small>
        </div>
        <select className="language-select" value={locale} onChange={(event) => onLocale(event.target.value as Locale)} aria-label="Language">
          {locales.map((item) => (
            <option value={item} key={item}>{languageNames[item]}</option>
          ))}
        </select>
      </section>

      <section className="legal-shell">
        <aside className="legal-index">
          <a href="#terms">{c.terms}</a>
          <a href="#privacy">{c.privacy}</a>
          <a href="#acceptable-use">{c.acceptableUse}</a>
          <a href="#payments">{c.paymentsRefunds}</a>
          <a href="#contact">{c.legalContact}</a>
        </aside>

        <div className="legal-doc">
          <article id="terms">
            <h2>{c.terms}</h2>
            {c.legalTermsBody.map((text) => <p key={text}>{text}</p>)}
          </article>

          <article id="privacy">
            <h2>{c.privacy}</h2>
            {c.legalPrivacyBody.map((text) => <p key={text}>{text}</p>)}
          </article>

          <article id="acceptable-use">
            <h2>{c.acceptableUse}</h2>
            {c.legalAcceptableUseBody.map((text) => <p key={text}>{text}</p>)}
          </article>

          <article id="payments">
            <h2>{c.paymentsRefunds}</h2>
            {c.legalPaymentsBody.map((text) => <p key={text}>{text}</p>)}
          </article>

          <article id="contact">
            <h2>{c.legalContact}</h2>
            {c.legalContactBody.map((text) => <p key={text}>{text}</p>)}
            <p className="legal-note">{c.legalNote}</p>
          </article>
        </div>
      </section>
    </main>
  );
}