import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { BRANDS, DEFAULT_BRAND_ID, getBrand, type BrandConfig } from "./brands";
import { mergeBrands, type BrandTenantRow } from "./brand-tenant";
import { listPublicBrandTenants } from "@/lib/brand-tenants.functions";
import { DRAFT_BRAND_ID, readDraftBrand } from "./brand-draft";
import { subscribeBrandUpdates } from "./brand-sync";

/**
 * Brand resolution order (first match wins):
 *   1. `?brand=<id>` search param — how a gate hands its tenant to /login
 *   2. `VITE_BRAND_ID` build env — single-tenant deployments
 *   3. hostname mapping from the brand registry — multi-tenant deployments
 *   4. DEFAULT_BRAND_ID
 *
 * Candidates are the built-in registry merged with the active tenants created
 * in the admin console (a DB tenant wins on id collision).
 */
export function resolveBrandId(
  input: { param?: string | null; host?: string | null },
  candidates: BrandConfig[] = BRANDS,
): string {
  const fromParam = candidates.find((b) => b.id === input.param)?.id;
  if (fromParam) return fromParam;

  const fromEnv = candidates.find((b) => b.id === import.meta.env["VITE_BRAND_ID"])?.id;
  if (fromEnv) return fromEnv;

  const host = input.host?.toLowerCase().split(":")[0];
  const fromHost = host ? candidates.find((b) => b.hosts.includes(host))?.id : undefined;
  if (fromHost) return fromHost;

  return DEFAULT_BRAND_ID;
}

interface BrandContextValue {
  brand: BrandConfig;
  /** Every selectable brand: built-ins plus active DB tenants. */
  brands: BrandConfig[];
  /** Switch brand for the current session (admin preview). */
  setBrandId: (id: string) => void;
  /**
   * Invalidate the tenant cache and re-apply themes now — call after saving or
   * deleting a tenant so open pages re-render without a manual refresh.
   */
  refreshBrands: () => Promise<void>;
}

const fallback: BrandContextValue = {
  brand: getBrand(DEFAULT_BRAND_ID),
  brands: BRANDS,
  setBrandId: () => {},
  refreshBrands: async () => {},
};

const BrandContext = createContext<BrandContextValue>(fallback);

export function useBrand(): BrandConfig {
  return useContext(BrandContext).brand;
}

export function useBrandRegistry(): BrandContextValue {
  return useContext(BrandContext);
}

/**
 * Applies the resolved brand's palette by writing its CSS custom properties on
 * <html>, so every existing semantic token (bg-primary, ring, shadow-glow, …)
 * re-themes without touching component code.
 */
export function BrandProvider({ children }: { children: ReactNode }) {
  // Server render uses the env/default brand; the client refines it from the
  // URL, hostname and DB tenants after hydration, so there is no mismatch.
  const [tenants, setTenants] = useState<BrandTenantRow[]>([]);
  const [brandId, setBrandId] = useState(() => resolveBrandId({}));
  const [pinned, setPinned] = useState(false);

  const brands = useMemo(() => mergeBrands(tenants), [tenants]);

  const refreshBrands = useCallback(async () => {
    try {
      setTenants(await listPublicBrandTenants());
    } catch {
      /* branding falls back to the built-in registry */
    }
  }, []);

  useEffect(() => {
    void refreshBrands();
  }, [refreshBrands]);

  const [draftBrand, setDraftBrand] = useState<BrandConfig | null>(null);

  // Another tab (or this one) saved a tenant / edited the wizard draft: drop the
  // cache or re-read the draft and re-apply the palette immediately.
  useEffect(
    () =>
      subscribeBrandUpdates((kind) => {
        if (kind === "saved") {
          void refreshBrands();
          return;
        }
        const draft = readDraftBrand();
        if (!draft) return;
        const previewingDraft =
          brandId === DRAFT_BRAND_ID ||
          new URLSearchParams(window.location.search).get("brand") === DRAFT_BRAND_ID;
        if (!previewingDraft) return;
        setDraftBrand(draft);
        setBrandId(DRAFT_BRAND_ID);
      }),
    [refreshBrands, brandId],
  );

  useEffect(() => {
    if (pinned) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("brand") === DRAFT_BRAND_ID) {
      const draft = readDraftBrand();
      if (draft) {
        setDraftBrand(draft);
        setBrandId(DRAFT_BRAND_ID);
        return;
      }
    }
    setDraftBrand(null);
    setBrandId(
      resolveBrandId({ param: params.get("brand"), host: window.location.hostname }, brands),
    );
  }, [brands, pinned]);

  const brand = useMemo(
    () =>
      (brandId === DRAFT_BRAND_ID ? draftBrand : null) ??
      brands.find((b) => b.id === brandId) ??
      getBrand(brandId),
    [brands, brandId, draftBrand],
  );

  // Keyed by the serialized palette so a saved theme change re-writes the CSS
  // custom properties even when the brand identity itself is unchanged.
  const themeKey = useMemo(() => JSON.stringify(brand.theme), [brand]);

  useEffect(() => {
    const root = document.documentElement;
    const entries = Object.entries(brand.theme);
    for (const [key, value] of entries) root.style.setProperty(key, value);
    return () => {
      for (const [key] of entries) root.style.removeProperty(key);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [themeKey]);

  const value = useMemo<BrandContextValue>(
    () => ({
      brand,
      brands,
      setBrandId: (id: string) => {
        setPinned(true);
        setBrandId(id);
      },
      refreshBrands,
    }),
    [brand, brands, refreshBrands],
  );

  return <BrandContext.Provider value={value}>{children}</BrandContext.Provider>;
}
