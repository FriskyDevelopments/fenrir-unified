/** A verified MyFenrir documentation URL must be supplied explicitly. */
export const knowledgeBaseUrl: string | null =
  import.meta.env.VITE_MYFENRIR_DOCS_URL?.trim() || null;

export const knowledgeBaseLabel = "Wiki";
