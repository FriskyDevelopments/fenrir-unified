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
        "theme-accent": "var(--theme-accent)",
        brand: {
          primary: "hsl(var(--brand-primary))",
          secondary: "hsl(var(--brand-secondary))",
          accent: "hsl(var(--brand-accent))",
          glow: "hsl(var(--brand-glow))"
        },
        theme: {
          bg: "hsl(var(--theme-bg))",
          text: "hsl(var(--theme-text))",
          "text-muted": "hsl(var(--theme-text-muted))",
          border: "hsl(var(--theme-border))",
          surface: "hsl(var(--theme-surface))"
        }
      },
      backgroundImage: {
        "brand-gradient":
          "linear-gradient(96deg, hsl(var(--brand-gradient-start)), hsl(var(--brand-gradient-middle)), hsl(var(--brand-gradient-end)))"
      },
      boxShadow: {
        glow: "0 24px 90px rgba(0,0,0,.38), 0 0 54px var(--theme-glow)",
        "glow-sm": "0 0 8px hsl(var(--theme-glow) / 0.5)",
        "glow-lg": "0 0 18px hsl(var(--theme-glow) / 0.35)"
      },
      borderRadius: {
        fenrir: "8px"
      },
      fontFamily: {
        display: ["Fraunces", "serif"],
        mono: ["JetBrains Mono", "monospace"]
      },
      animation: {
        "pulse-glow": "pulse-glow 2s cubic-bezier(0.4, 0, 0.6, 1) infinite"
      },
      keyframes: {
        "pulse-glow": {
          "0%, 100%": { opacity: "1" },
          "50%": { opacity: "0.7" }
        }
      }
    }
  },
  plugins: []
} satisfies Config;
