import { betterAuth } from "better-auth";
import { APP_AUTH_TABLES, FRISKY_AUTH_BASE_PATH, type FriskyAuthOptions } from "./types";
import { authOptionsFromEnv, neonConnectionString } from "./env";

export { APP_AUTH_TABLES, FRISKY_AUTH_BASE_PATH } from "./types";
export {
  appleConfigured,
  authOptionsFromEnv,
  cookieDomainFromBaseURL,
  enabledFlag,
  enabledSocialProviders,
  friskyAuthSecret,
  neonConnectionString,
  socialProviderConfig,
  trustedOriginsFromEnv,
} from "./env";
export type { FriskyAuthEnv, FriskyAuthOptions, FriskySocialProvider, QueryableDatabase } from "./types";

/**
 * Creates a Fenrir Better Auth instance from the supplied authentication configuration.
 *
 * @param options - Authentication settings, including credentials, database, trusted origins, and optional social providers
 * @returns A configured Better Auth instance
 */
export function createFriskyAuth(options: FriskyAuthOptions) {
  const google = options.socialProviders.google;
  const microsoft = options.socialProviders.microsoft;
  const apple = options.socialProviders.apple;

  return betterAuth({
    appName: "Fenrir",
    secret: options.secret,
    baseURL: options.baseURL,
    basePath: FRISKY_AUTH_BASE_PATH,
    trustedOrigins: options.trustedOrigins,
    database: options.database,
    user: { modelName: APP_AUTH_TABLES.user },
    account: { modelName: APP_AUTH_TABLES.account },
    verification: { modelName: APP_AUTH_TABLES.verification },
    emailAndPassword: { enabled: false },
    socialProviders: {
      ...(google
        ? {
            google: {
              clientId: google.clientId,
              clientSecret: google.clientSecret,
            },
          }
        : {}),
      ...(microsoft
        ? {
            microsoft: {
              clientId: microsoft.clientId,
              clientSecret: microsoft.clientSecret,
              tenantId: "common",
            },
          }
        : {}),
      ...(apple
        ? {
            apple: {
              clientId: apple.clientId,
              clientSecret: apple.clientSecret,
            },
          }
        : {}),
    },
    session: {
      modelName: APP_AUTH_TABLES.session,
      expiresIn: 60 * 60 * 24 * 7,
      updateAge: 60 * 60 * 24,
      cookieCache: {
        enabled: true,
        maxAge: 60 * 5,
      },
    },
    advanced: {
      useSecureCookies: !options.baseURL.startsWith("http://localhost"),
      defaultCookieAttributes: {
        path: "/",
        sameSite: "lax",
        httpOnly: true,
        secure: !options.baseURL.startsWith("http://localhost"),
      },
      ...(options.cookieDomain
        ? {
            crossSubDomainCookies: {
              enabled: true,
              domain: options.cookieDomain,
            },
          }
        : {}),
    },
  });
}

export type FriskyAuth = ReturnType<typeof createFriskyAuth>;

export { authOptionsFromEnv as defaultAuthOptionsFromEnv, neonConnectionString as defaultNeonConnectionString };
