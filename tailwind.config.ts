import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        prime: {
          bg: "#F6F5F2",
          card: "#FFFFFF",
          input: "#FFFFFF",
          "input-border": "#D4CFC4",
          border: "#E7E4DD",
          gold: "#C9A84C",
          "gold-hover": "#B8943E",
          text: "#111317",
          muted: "#5F636B",
          /** Dourado escuro para texto e links sobre fundo claro (legível). */
          "gold-ink": "#8A6A1E",
          "gold-soft": "#F7F0DE",
          sidebar: "#1A1A1A",
          "sidebar-text": "#888888",
          "sidebar-active": "#C9A84C",
          "sidebar-hover": "#252525",
          green: "#2E7D32",
          red: "#C62828",
          amber: "#E65100"
        }
      },
      borderRadius: {
        prime: "10px",
        "prime-card": "16px"
      },
      boxShadow: {
        "prime-card": "0 1px 2px rgba(16,17,20,0.04), 0 4px 16px -8px rgba(16,17,20,0.10)"
      },
      // Letras um pouco maiores em todo o sistema (mais fácil de ler no computador e no celular).
      fontSize: {
        "2xs": ["0.75rem", { lineHeight: "1rem" }],
        xs: ["0.8125rem", { lineHeight: "1.15rem" }],
        sm: ["0.9375rem", { lineHeight: "1.4rem" }],
        base: ["1rem", { lineHeight: "1.55rem" }]
      },
      fontFamily: {
        sans: ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        "prime-display": ["var(--font-inter)", "Inter", "ui-sans-serif", "system-ui", "sans-serif"],
        /** Títulos com serifa do site público. */
        "prime-serif": ["ui-serif", "Iowan Old Style", "Palatino Linotype", "Palatino", "Georgia", "serif"]
      }
    }
  },
  plugins: []
};

export default config;
