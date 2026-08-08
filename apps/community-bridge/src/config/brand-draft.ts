/**
 * Draft brand preview channel.
 *
 * The setup wizard can open the real tenant login page in a new tab before the
 * tenant exists in the database. It stashes the unsaved draft in localStorage
 * (same origin, so the new tab reads it) and links to `?brand=__draft`, which
 * BrandProvider resolves from that stash instead of the tenant registry.
 */

import { rowToBrandConfig, type BrandTenantInput } from "./brand-tenant";
import type { BrandConfig } from "./brands";
import { publishBrandUpdate } from "./brand-sync";

export const DRAFT_BRAND_ID = "__draft";
const STORAGE_KEY = "brand-draft-preview";

export function saveDraftBrand(draft: BrandTenantInput) {
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(draft));
  } catch {
    /* private mode / quota — preview falls back to the default brand */
  }
  // Nudge any open preview tab so it re-reads the draft palette right away.
  publishBrandUpdate("draft");
}


export function readDraftBrand(): BrandConfig | null {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw) as BrandTenantInput;
    const brand = rowToBrandConfig({ ...draft, id: DRAFT_BRAND_ID, updated_at: "" });
    return { ...brand, id: DRAFT_BRAND_ID };
  } catch {
    return null;
  }
}
