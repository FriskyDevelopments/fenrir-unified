import { useEffect, useState } from "react";
import { useBrandTheme } from "./useBrandTheme";
import type { BrandKey } from "../../theme/brandThemes";

export type CommunityConfig = {
  slug: string;
  name: string;
  brand: BrandKey;
  logoSrc?: string | null;
  headline?: string;
  subheadline?: string;
};

const FALLBACK: CommunityConfig = {
  slug: "fenrir",
  name: "Fenrir Bridge",
  brand: "fenrir"
};

/**
 * useCommunity — fetches community config (or falls back) and injects the brand theme.
 * Ported from community-gate useCommunity hook.
 */
export function useCommunity(slug?: string) {
  const [community, setCommunity] = useState<CommunityConfig | null>(null);
  const [loading, setLoading] = useState(true);
  const brand = useBrandTheme(community?.brand ?? "fenrir");

  useEffect(() => {
    let cancelled = false;
    async function load() {
      setLoading(true);
      try {
        // TODO: wire to /api/community-auth/brand/:slug when backend is live
        const res = slug
          ? await fetch(`/api/community-auth/brand/${slug}`).catch(() => null)
          : null;
        const data = res && res.ok ? await res.json() : null;
        if (!cancelled) {
          setCommunity(data ?? (slug ? { ...FALLBACK, slug, name: slug } : FALLBACK));
        }
      } catch {
        if (!cancelled) setCommunity(slug ? { ...FALLBACK, slug, name: slug } : FALLBACK);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  return { community, loading, ...brand };
}
