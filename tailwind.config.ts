import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        burd: {
          page: "#0A0A0A",
          "section-alt": "#080808",
          panel: "#111111",
          "panel-alt": "#141414",
          "panel-deep": "#090909",
          badge: "#1A1A1A",
          muted: "#202020",
          border: "#262626",
          "border-panel": "#2A2A2A",
          "border-muted": "#2F2F2F",
          "border-soft": "#3A3A3A",
          text: "#F5F5F5",
          "text-secondary": "#9CA3AF",
          "text-tertiary": "#626262",
          success: "#3F8047",
          blue: "#1F7EA6",
          "brand-blue": "#0091E2",
          light: "#D9D9D9",
          danger: "#B34747",
        },
      },
      borderRadius: {
        shell: "32px",
        panel: "8px",
        tile: "12px",
      },
      fontFamily: {
        sans: [
          '"SF Pro Display"',
          '"SF Pro Text"',
          "-apple-system",
          "BlinkMacSystemFont",
          '"Inter"',
          "sans-serif",
        ],
        mono: ['"JetBrains Mono"', "monospace"],
      },
      boxShadow: {
        panel: "0 0 0 1px rgba(255, 255, 255, 0.02)",
      },
    },
  },
  plugins: [],
};

export default config;
