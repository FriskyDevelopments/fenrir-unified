/**
 * La base de conocimiento de MyFenrir es la Wiki "Guardian Protocol"
 * (public/wiki, también servida en prod en myfenrir.com/wiki).
 * VITE_KNOWLEDGE_BASE_URL permite apuntar a otro destino si hiciera falta.
 * (Astelar es un producto aparte — no es la KB de MyFenrir.)
 */
export const knowledgeBaseUrl: string = import.meta.env.VITE_KNOWLEDGE_BASE_URL || "/wiki";

export const knowledgeBaseLabel = "Wiki";
