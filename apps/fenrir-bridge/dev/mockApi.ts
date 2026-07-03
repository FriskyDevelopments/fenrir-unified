import type { Plugin } from "vite";

// DEV-ONLY mock of the Pages Functions API, enabled by FENRIR_DEV_MOCK_API=1
// (`npm run dev:mock`). Lets the auth-gated dashboard and the Community Gate
// render in plain `vite dev` — no WorkOS session, no Neon — so UI work on the
// gate/wizard can be previewed and screenshotted locally. Never bundled: it is
// a serve-time middleware only, and prod deploys ship `dist` + real functions.
type BrandRow = {
  slug: string;
  name: string;
  logo_url: string | null;
  mascot_url: string | null;
  background_url: string | null;
  primary_color: string;
  secondary_color: string;
  accent_color: string;
  headline: string;
  subheadline: string;
  invite_prefix: string;
  enabled_auth_providers: string[];
  default_access_state: "provisional" | "open" | "invite_only" | "disabled";
  communityOrgId: string | null;
  communityId: string;
  fallbackUsed: boolean;
};

const brands = new Map<string, BrandRow>();

function defaultBrand(slug: string): BrandRow {
  return {
    slug,
    name: "Neon Nexus",
    logo_url: null,
    mascot_url: null,
    background_url: null,
    primary_color: "#22c7a8",
    secondary_color: "#8cb9ff",
    accent_color: "#9b8cff",
    headline: "Enter Neon Nexus",
    subheadline: "Verify your identity and request access to the community.",
    invite_prefix: slug,
    enabled_auth_providers: ["magic_link"],
    default_access_state: "provisional",
    communityOrgId: null,
    communityId: `mock-${slug}`,
    fallbackUsed: false
  };
}

function json(res: import("http").ServerResponse, status: number, body: unknown) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json; charset=utf-8");
  res.end(JSON.stringify(body));
}

function readBody(req: import("http").IncomingMessage): Promise<string> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (chunk) => (data += chunk));
    req.on("end", () => resolve(data));
  });
}

export function fenrirDevMockApi(): Plugin {
  return {
    name: "fenrir-dev-mock-api",
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = (req.url ?? "").split("?")[0] ?? "";
        if (!url.startsWith("/api/")) return next();

        if (url === "/api/community-auth/proposal") {
          return json(res, 200, {
            ok: true,
            product: "fenrir-community-gate",
            database: "neon",
            configured: true,
            isolatedFrom: {
              friskyClientPortal: true,
              friskySessionCookie: "fenrir_session",
              communitySessionCookie: "fenrir_community_session",
              sharedSupabaseAuth: false,
              sharedFriskyD1Tables: false
            },
            requiredEnv: [],
            schemaFile: "neon-community-gate.sql",
            tables: ["community", "community_member", "community_audit"]
          });
        }

        const publicBrand = url.match(/^\/api\/community-auth\/brand\/([^/]+)$/);
        if (publicBrand) {
          const slug = decodeURIComponent(publicBrand[1]!).toLowerCase();
          return json(res, 200, { ok: true, brand: brands.get(slug) ?? defaultBrand(slug) });
        }

        const adminBrand = url.match(/^\/api\/community-auth\/admin\/brands\/([^/]+)$/);
        if (adminBrand) {
          const slug = decodeURIComponent(adminBrand[1]!).toLowerCase();
          if (req.method === "PUT") {
            void readBody(req).then((raw) => {
              const patch = JSON.parse(raw || "{}") as Partial<BrandRow>;
              const current = brands.get(slug) ?? defaultBrand(slug);
              const merged: BrandRow = { ...current, ...Object.fromEntries(Object.entries(patch).filter(([, v]) => v !== undefined)) } as BrandRow;
              brands.set(slug, merged);
              json(res, 200, { ok: true, brand: merged, authorization: { allowed: true, reason: "internal_override" } });
            });
            return;
          }
          return json(res, 200, {
            ok: true,
            brand: brands.get(slug) ?? defaultBrand(slug),
            authorization: { allowed: true, reason: "internal_override" }
          });
        }

        if (url === "/api/community-auth/magic-link/request" && req.method === "POST") {
          return json(res, 200, { ok: true, message: "Magic link sent (dev mock).", devLink: "/community/neon-nexus?mock-link=1" });
        }

        // Everything else: 404 JSON so the SPA's built-in devApiFallback demo
        // store (src/services/api.ts) takes over — it already mocks auth,
        // app-state, billing, and the rest of the dashboard in DEV.
        return json(res, 404, { ok: false, error: "mock_unhandled" });
      });
    }
  };
}
