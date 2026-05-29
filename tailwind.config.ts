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
        "brand-primary": "rgb(var(--brand-primary-rgb) / <alpha-value>)",
        "brand-accent": "rgb(var(--brand-accent-rgb) / <alpha-value>)",
        ink: "rgb(var(--ink-rgb) / <alpha-value>)",
        cream: "rgb(var(--cream-rgb) / <alpha-value>)",
        "cream-dim": "#cdbfa0",
      },
      fontFamily: {
        sans: ["var(--brand-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        body: ["var(--brand-body)", "ui-sans-serif", "system-ui", "sans-serif"],
        display: ["var(--brand-display)", "Impact", "sans-serif"],
      },
    },
  },
  plugins: [],
};

export default config;
