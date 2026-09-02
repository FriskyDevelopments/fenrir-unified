import { createAuthClient } from "better-auth/client";
import { FRISKY_AUTH_BASE_PATH } from "./types";

export { FRISKY_AUTH_BASE_PATH } from "./types";
export type { FriskySocialProvider } from "./types";

/**
 * Creates a Frisky authentication client.
 *
 * @param options - Optional client configuration, including the server base URL and authentication base path
 */
export function createFriskyAuthClient(options: { baseURL?: string; basePath?: string } = {}) {
  return createAuthClient({
    baseURL: options.baseURL,
    basePath: options.basePath ?? FRISKY_AUTH_BASE_PATH,
  });
}

export type FriskyAuthClient = ReturnType<typeof createFriskyAuthClient>;
