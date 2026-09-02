import { createContext, useContext, type ReactNode } from "react";
import { useCommunity, type CommunityConfig } from "./useCommunity";
import type { BrandKey, BrandTheme } from "../../theme/brandThemes";

type CommunityContextValue = {
  community: CommunityConfig | null;
  loading: boolean;
  theme: BrandTheme;
  key: BrandKey;
  setKey: (k: BrandKey) => void;
  themes: BrandKey[];
};

const CommunityContext = createContext<CommunityContextValue | null>(null);

/**
 * CommunityProvider — wraps gate pages so any child can read the active community + theme.
 * Ported from community-gate CommunityContext.jsx.
 */
export function CommunityProvider({ slug, children }: { slug?: string; children: ReactNode }) {
  const value = useCommunity(slug);
  return <CommunityContext.Provider value={value}>{children}</CommunityContext.Provider>;
}

export function useCommunityContext() {
  const ctx = useContext(CommunityContext);
  if (!ctx) throw new Error("useCommunityContext must be used within <CommunityProvider>");
  return ctx;
}
