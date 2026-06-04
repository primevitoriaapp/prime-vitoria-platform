import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/app/**/*.{js,ts,jsx,tsx,mdx}", "./src/components/**/*.{js,ts,jsx,tsx,mdx}"],
  theme: {
    extend: {
      colors: {
        prime: {
          bg: "#F8F6F1",
          card: "#FFFFFF",
          input: "#FFFFFF",
          "input-border": "#D4CFC4",
          border: "#E8E4DC",
          gold: "#C9A84C",
          "gold-hover": "#B8943E",
          text: "#1A1A1A",
          muted: "#666666",
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
        prime: "8px",
        "prime-card": "12px"
      },
      boxShadow: {
        "prime-card": "0 1px 4px rgba(0,0,0,0.08)"
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
