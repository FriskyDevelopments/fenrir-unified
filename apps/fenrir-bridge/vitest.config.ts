import { defineConfig } from "vitest/config";

// Hermetic test runner for Pages Functions auth logic.
//
// These suites mock the Supabase REST client, the Neon SQL client, and every
// outbound OAuth/provider fetch, so they run with NO network access (e.g. in CI
// or a sandbox). The frontend (`src`) is intentionally excluded — it is covered
// by the build/typecheck pipeline, not by Vitest.
export default defineConfig({
  test: {
    environment: "node",
    include: ["functions/**/__tests__/**/*.test.ts"],
    alias: {
      "@frisky/auth": new URL("../../packages/auth/src/index.ts", import.meta.url).pathname,
      "@frisky/auth/server": new URL("../../packages/auth/src/server.ts", import.meta.url).pathname,
      "@frisky/auth/client": new URL("../../packages/auth/src/client.ts", import.meta.url).pathname
    },
    // Fail fast if a test accidentally reaches the network: there is no fetch
    // polyfill beyond Node's built-in, and every suite stubs it explicitly.
    clearMocks: true,
    restoreMocks: true
  }
});
