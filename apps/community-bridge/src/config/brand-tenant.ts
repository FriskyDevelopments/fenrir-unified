/**
 * Database-backed brand tenants.
 *
 * `brands.ts` holds the built-in registry (shipped defaults). This module maps
 * rows of `public.brand_tenants` — created through the admin UI — onto the very
 * same `BrandConfig` shape, so a new brand is a row, not a deploy.
 */

import { z } from "zod";
import { BRANDS, type BrandConfig, type ProviderId } from "./brands";

export const PROVIDER_IDS = ["apple", "google", "microsoft"] as const;

const idField = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/, "3–40 lowercase letters, numbers or dashes");

const pathField = z
  .string()
  .trim()
  .max(200)
  .regex(/^\/[A-Za-z0-9\-._~/]*$/, "Must be a same-origin path starting with /");

const hostField = z
  .string()
  .trim()
  .toLowerCase()
  .max(253)
  .regex(/^[a-z0-9.-]+$/, "Hostname only — no protocol or path");

const assetField = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v === "" || v.startsWith("/") || v.startsWith("https://"), {
    message: "Use an uploaded asset or an https:// URL",
  })
  .transform((v) => (v === "" ? null : v))
  .nullable();

const linkField = z
  .string()
  .trim()
  .max(2048)
  .refine((v) => v.startsWith("/") || v.startsWith("https://"), {
    message: "Use a path or an https:// URL",
  });

/** Only CSS custom properties with safe, declaration-free values. */
const themeField = z
  .record(
    z.string().regex(/^--[a-z0-9-]{2,40}$/, "Token names look like --primary"),
    z
      .string()
      .trim()
      .min(1)
      .max(160)
      .regex(/^[^;{}<>]+$/, "Token values cannot contain ; { } < >"),
  )
  .refine((t) => Object.keys(t).length <= 40, "Up to 40 theme tokens");

export const brandTenantSchema = z.object({
  brand_id: idField,
  name: z.string().trim().min(1).max(60),
  tagline: z.string().trim().max(160),
  hostnames: z.array(hostField).max(12),
  providers: z.array(z.enum(PROVIDER_IDS)).min(1),
  theme: themeField,
  logo_url: assetField,
  wordmark_url: assetField,
  community_id: idField,
  community_label: z.string().trim().max(60).nullable(),
  gate_preset: z.string().trim().min(1).max(40),
  terminal_command: z.string().trim().min(1).max(60),
  login_headline: z.string().trim().max(80),
  login_subheadline: z.string().trim().max(160),
  login_signin_label: z.string().trim().max(40),
  login_signup_label: z.string().trim().max(60),
  login_forgot_label: z.string().trim().max(60),
  login_terminal_header: z.string().trim().max(40),
  login_terminal_lines: z.array(z.string().trim().max(160)).max(8),
  activate_headline: z.string().trim().max(80),
  activate_subheadline: z.string().trim().max(160),
  activate_steps_title: z.string().trim().max(80),
  activate_bot_label: z.string().trim().max(60),
  activate_submit_label: z.string().trim().max(60),
  activate_success_headline: z.string().trim().max(80),

  after_login_path: pathField,
  oauth_return_path: pathField,
  site_url: z
    .string()
    .trim()
    .max(2048)
    .refine((v) => v === "" || v.startsWith("https://"), { message: "Use an https:// URL" })
    .transform((v) => (v === "" ? null : v))
    .nullable(),
  terms_url: linkField,
  privacy_url: linkField,
  is_active: z.boolean(),
});

export type BrandTenantInput = z.infer<typeof brandTenantSchema>;

export interface BrandTenantRow extends BrandTenantInput {
  id: string;
  updated_at: string;
}

export const BRAND_TENANT_COLUMNS =
  "id, updated_at, brand_id, name, tagline, hostnames, providers, theme, logo_url, wordmark_url, community_id, community_label, gate_preset, terminal_command, login_headline, login_subheadline, login_signin_label, login_signup_label, login_forgot_label, login_terminal_header, login_terminal_lines, activate_headline, activate_subheadline, activate_steps_title, activate_bot_label, activate_submit_label, activate_success_headline, after_login_path, oauth_return_path, site_url, terms_url, privacy_url, is_active";


export function emptyBrandTenant(): BrandTenantInput {
  return {
    brand_id: "",
    name: "",
    tagline: "",
    hostnames: [],
    providers: ["apple", "google", "microsoft"],
    theme: { "--primary": "oklch(0.637 0.208 25.3)" },
    logo_url: null,
    wordmark_url: null,
    community_id: "",
    community_label: null,
    gate_preset: "fenrir-dark",
    terminal_command: "login",
    login_headline: "",
    login_subheadline: "",
    login_signin_label: "Continue with",
    login_signup_label: "",
    login_forgot_label: "",
    login_terminal_header: "",
    login_terminal_lines: [],
    activate_headline: "",
    activate_subheadline: "",
    activate_steps_title: "",
    activate_bot_label: "",
    activate_submit_label: "",
    activate_success_headline: "",

    after_login_path: "/dashboard",
    oauth_return_path: "/",
    site_url: null,
    terms_url: "/terms",
    privacy_url: "/privacy",
    is_active: true,
  };
}

/** A DB tenant row rendered as the runtime brand config the app already uses. */
export function rowToBrandConfig(row: BrandTenantRow): BrandConfig {
  return {
    id: row.brand_id,
    name: row.name,
    tagline: row.tagline,
    hosts: row.hostnames ?? [],
    logo: {
      markUrl: row.logo_url ?? undefined,
      wordmarkUrl: row.wordmark_url ?? undefined,
      alt: `${row.name} logo`,
    },
    theme: row.theme ?? {},
    providers: (row.providers ?? []) as ProviderId[],
    community: {
      id: row.community_id,
      label: row.community_label ?? row.name,
    },
    redirect: {
      afterLogin: row.after_login_path,
      oauthReturnPath: row.oauth_return_path,
    },
    gatePreset: row.gate_preset,
    terminalCommand: row.terminal_command,
    login: {
      headline: row.login_headline ?? "",
      subheadline: row.login_subheadline ?? "",
      signInLabel: row.login_signin_label ?? "",
      signUpLabel: row.login_signup_label ?? "",
      forgotLabel: row.login_forgot_label ?? "",
      terminalHeader: row.login_terminal_header ?? "",
      terminalCommand: "",
      terminalLines: row.login_terminal_lines ?? [],
    },
    activate: {
      headline: row.activate_headline ?? "",
      subheadline: row.activate_subheadline ?? "",
      stepsTitle: row.activate_steps_title ?? "",
      botLabel: row.activate_bot_label ?? "",
      submitLabel: row.activate_submit_label ?? "",
      successHeadline: row.activate_success_headline ?? "",
    },

    links: {
      site: row.site_url ?? undefined,
      terms: row.terms_url,
      privacy: row.privacy_url,
    },
  };
}

/** Built-in registry + active DB tenants; a DB tenant wins on id collision. */
export function mergeBrands(rows: BrandTenantRow[] | null | undefined): BrandConfig[] {
  const dbBrands = (rows ?? []).filter((r) => r.is_active).map(rowToBrandConfig);
  const overridden = new Set(dbBrands.map((b) => b.id));
  return [...BRANDS.filter((b) => !overridden.has(b.id)), ...dbBrands];
}

/** The reverse mapping, used to prefill the admin form from a built-in brand. */
export function brandConfigToTenant(brand: BrandConfig): BrandTenantInput {
  return {
    brand_id: brand.id,
    name: brand.name,
    tagline: brand.tagline,
    hostnames: brand.hosts,
    providers: brand.providers as BrandTenantInput["providers"],
    theme: brand.theme,
    logo_url: brand.logo.markUrl ?? null,
    wordmark_url: brand.logo.wordmarkUrl ?? null,
    community_id: brand.community.id,
    community_label: brand.community.label,
    gate_preset: brand.gatePreset,
    terminal_command: brand.terminalCommand,
    login_headline: brand.login?.headline ?? "",
    login_subheadline: brand.login?.subheadline ?? "",
    login_signin_label: brand.login?.signInLabel ?? "Continue with",
    login_signup_label: brand.login?.signUpLabel ?? "",
    login_forgot_label: brand.login?.forgotLabel ?? "",
    login_terminal_header: brand.login?.terminalHeader ?? "",
    login_terminal_lines: brand.login?.terminalLines ?? [],
    activate_headline: brand.activate?.headline ?? "",
    activate_subheadline: brand.activate?.subheadline ?? "",
    activate_steps_title: brand.activate?.stepsTitle ?? "",
    activate_bot_label: brand.activate?.botLabel ?? "",
    activate_submit_label: brand.activate?.submitLabel ?? "",
    activate_success_headline: brand.activate?.successHeadline ?? "",

    after_login_path: brand.redirect.afterLogin,
    oauth_return_path: brand.redirect.oauthReturnPath,
    site_url: brand.links.site ?? null,
    terms_url: brand.links.terms,
    privacy_url: brand.links.privacy,
    is_active: true,
  };
}
