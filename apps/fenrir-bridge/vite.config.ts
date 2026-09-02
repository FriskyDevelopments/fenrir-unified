import path from "node:path";
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const gateBrand = path.resolve(import.meta.dirname, "../../packages/gate-brand/src/presets.ts");

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      "@frisky/gate-brand": gateBrand,
      "@frisky/auth/client": path.resolve(import.meta.dirname, "../../packages/auth/src/client.ts"),
      "@frisky/auth/server": path.resolve(import.meta.dirname, "../../packages/auth/src/server.ts"),
      "@frisky/auth": path.resolve(import.meta.dirname, "../../packages/auth/src/index.ts")
    }
  },
  server: {
    port: 5177,
    fs: {
      allow: ["..", "../../packages"]
    },
    proxy: {
      "/auth": {
        target: "http://127.0.0.1:8787",
        changeOrigin: true
      }
    }
  }
});
