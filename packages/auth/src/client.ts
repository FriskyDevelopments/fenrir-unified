import { createAuthClient } from "better-auth/client";
import { FRISKY_AUTH_BASE_PATH } from "./types";

export { FRISKY_AUTH_BASE_PATH } from "./types";
export type { FriskySocialProvider } from "./types";

export function createFriskyAuthClient(options: { baseURL?: string; basePath?: string } = {}) {
  return createAuthClient({
    baseURL: options.baseURL,
    basePath: options.basePath ?? FRISKY_AUTH_BASE_PATH,
  });
}

export type FriskyAuthClient = ReturnType<typeof createFriskyAuthClient>;
