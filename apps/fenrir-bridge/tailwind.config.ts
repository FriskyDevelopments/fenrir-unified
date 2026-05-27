import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        app: "var(--app)",
        surface: "var(--surface)",
        "theme-primary": "var(--theme-primary)",
        "theme-secondary": "var(--theme-secondary)",
        "theme-accent": "var(--theme-accent)"
      },
      boxShadow: {
        glow: "0 24px 90px rgba(0,0,0,.38), 0 0 54px var(--theme-glow)"
      },
      borderRadius: {
        fenrir: "8px"
      }
    }
  },
  plugins: []
} satisfies Config;
