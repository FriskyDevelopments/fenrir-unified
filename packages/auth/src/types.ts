export type FriskyAuthEnv = {
  NEON_DATABASE_URL?: string;
  DATABASE_URL?: string;
  BETTER_AUTH_SECRET?: string;
  FRISKY_AUTH_SECRET?: string;
  SESSION_SECRET?: string;
  FRISKY_AUTH_ENABLED?: string;
  BETTER_AUTH_URL?: string;
  GOOGLE_CLIENT_ID?: string;
  GOOGLE_CLIENT_SECRET?: string;
  MICROSOFT_CLIENT_ID?: string;
  MICROSOFT_CLIENT_SECRET?: string;
  APPLE_CLIENT_ID?: string;
  APPLE_CLIENT_SECRET?: string;
  APPLE_TEAM_ID?: string;
  APPLE_KEY_ID?: string;
  APPLE_PRIVATE_KEY?: string;
  FENRIR_ALLOWED_ORIGINS?: string;
  PUBLIC_SITE_URL?: string;
  PUBLIC_AUTH_URL?: string;
};

export type FriskySocialProvider = "google" | "microsoft" | "apple";

export type QueryableDatabase = {
  query: (queryText: string, values?: unknown[]) => Promise<unknown>;
};

export type FriskyAuthOptions = {
  env: FriskyAuthEnv;
  database: QueryableDatabase;
  baseURL: string;
  secret: string;
  trustedOrigins: string[];
  socialProviders: Partial<Record<FriskySocialProvider, { clientId: string; clientSecret: string }>>;
  cookieDomain?: string;
};

export const FRISKY_AUTH_BASE_PATH = "/api/frisky-auth";

export const APP_AUTH_TABLES = {
  user: "app_auth_user",
  session: "app_auth_session",
  account: "app_auth_account",
  verification: "app_auth_verification",
} as const;
