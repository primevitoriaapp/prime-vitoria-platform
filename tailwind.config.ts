import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        prime: {
          bg: "#0F0F0F",
          card: "#1A1A1A",
          input: "#1E1E1E",
          "input-border": "#2E2E2E",
          gold: "#C9A84C",
          "gold-hover": "#E2B95A",
          text: "#F5F5F5",
          muted: "#888888",
          sidebar: "#111111",
          "sidebar-hover": "#1F1F1F",
          green: "#2E7D32",
          red: "#C62828",
          amber: "#F57F17"
        }
      },
      borderRadius: {
        prime: "8px",
        "prime-card": "12px"
      },
      boxShadow: {
        "prime-card": "0 2px 8px rgba(0,0,0,0.4)"
      },
      fontFamily: {
        "prime-display": [
          "ui-serif",
          "Iowan Old Style",
          "Palatino Linotype",
          "Palatino",
          "Georgia",
          "serif"
        ]
      }
    }
  },
  plugins: []
};

export default config;
