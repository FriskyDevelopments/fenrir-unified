/**
 * Astelar — the Fenrir knowledge base. It lives as an ISOLATED nested repo
 * (apps/fenrir-bridge/astelar, gitignored here) and is linked from the page,
 * not bundled. The URL is environment-driven:
 *   - VITE_ASTELAR_KB_URL, set at build time, wins (use it in production
 *     once Astelar is deployed, e.g. its Cloudflare Pages URL).
 *   - Dev fallback: the local Astro dev server (astelar: `npm run dev`, :4321).
 *   - Prod fallback: /kb (add a _redirects rule when the deploy exists).
 */
export const knowledgeBaseUrl: string =
  import.meta.env.VITE_ASTELAR_KB_URL ||
  (import.meta.env.DEV ? "http://localhost:4321" : "/kb");

export const knowledgeBaseLabel = "Knowledge Base";
