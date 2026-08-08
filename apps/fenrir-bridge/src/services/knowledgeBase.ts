/**
 * Astelar — the Fenrir knowledge base. It lives as an ISOLATED submodule
 * (apps/fenrir-bridge/astelar) and its static build is mounted at /kb
 * (public/kb, regenerate with `npm run build:kb`). VITE_ASTELAR_KB_URL
 * overrides the destination if Astelar ever gets its own deploy.
 */
export const knowledgeBaseUrl: string = import.meta.env.VITE_ASTELAR_KB_URL || "/kb/";

export const knowledgeBaseLabel = "Knowledge Base";
