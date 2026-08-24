/**
 * La base de conocimiento canónica es el sitio editorial MyFenrir Docs.
 * VITE_KNOWLEDGE_BASE_URL permite apuntar a otro destino si hiciera falta.
 * (Astelar es un producto aparte — no es la KB de MyFenrir.)
 */
export const knowledgeBaseUrl: string = import.meta.env.VITE_KNOWLEDGE_BASE_URL || "https://myfenrir-docs.pages.dev/";

export const knowledgeBaseLabel = "Wiki";
