import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        "brand-green": "rgb(var(--brand-primary-rgb) / <alpha-value>)",
        "brand-green-light": "rgb(var(--brand-primary-light-rgb) / <alpha-value>)",
        "brand-gold": "rgb(var(--brand-accent-rgb) / <alpha-value>)",
        "brand-gold-light": "rgb(var(--brand-accent-light-rgb) / <alpha-value>)",
      },
      fontFamily: {
        sans: ["var(--brand-font, 'Inter')", "ui-sans-serif", "system-ui", "-apple-system", "BlinkMacSystemFont", "Segoe UI", "Roboto", "Helvetica Neue", "Arial", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
