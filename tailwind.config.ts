import type { Config } from "tailwindcss";

const config: Config = {
  darkMode: "class",
  content: [
    "./app/**/*.{js,ts,jsx,tsx,mdx}",
    "./components/**/*.{js,ts,jsx,tsx,mdx}",
  ],
  theme: {
    extend: {
      fontFamily: {
        sans: ["Inter", "system-ui", "-apple-system", "Segoe UI", "Roboto", "PingFang SC", "Microsoft YaHei", "sans-serif"],
      },
      colors: {
        brand: {
          50: "#eef4ff", 100: "#dbe7ff", 200: "#bcd2ff", 300: "#8eb4ff",
          400: "#598dff", 500: "#3366ff", 600: "#1f47e6", 700: "#1a37b8",
          800: "#1a3090", 900: "#1c2c72",
        },
      },
      boxShadow: {
        soft: "0 1px 2px rgba(16,24,40,0.04), 0 8px 24px rgba(16,24,40,0.06)",
        card: "0 1px 3px rgba(16,24,40,0.06), 0 1px 2px rgba(16,24,40,0.04)",
      },
    },
  },
  plugins: [],
};

export default config;
