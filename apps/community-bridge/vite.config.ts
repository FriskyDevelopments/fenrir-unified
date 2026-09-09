// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [mcpPlugin()],
    build: {
      rolldownOptions: {
        output: {
          // Keep the public entry below Vite's 500 kB warning threshold. The
          // app has large, cacheable framework/auth dependencies; splitting
          // them avoids making every route redownload one monolithic entry.
          codeSplitting: {
            maxSize: 450_000,
            groups: [
              {
                name: "vendor-supabase",
                test: /node_modules\/(?:@supabase|supabase)/,
                includeDependenciesRecursively: true,
              },
              {
                name: "vendor-tanstack",
                test: /node_modules\/@tanstack/,
                includeDependenciesRecursively: true,
              },
              {
                name: "vendor-motion",
                test: /node_modules\/(?:motion|framer-motion)/,
                includeDependenciesRecursively: true,
              },
              {
                name: "vendor-react",
                test: /node_modules\/(?:react|react-dom|scheduler)\//,
                includeDependenciesRecursively: true,
              },
            ],
          },
        },
      },
    },
  },
});
