/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Theme-driven colors (support Tailwind opacity modifiers via <alpha-value>).
        background: "rgb(var(--tw-background) / <alpha-value>)",
        panel: "rgb(var(--tw-panel) / <alpha-value>)",
        panelMuted: "rgb(var(--tw-panel-muted) / <alpha-value>)",
        border: "rgb(var(--tw-border) / <alpha-value>)",
        textMain: "rgb(var(--tw-text-main) / <alpha-value>)",
        textMuted: "rgb(var(--tw-text-muted) / <alpha-value>)",
        accent: "rgb(var(--tw-accent) / <alpha-value>)",
        danger: "rgb(var(--tw-danger) / <alpha-value>)",
      },
      boxShadow: {
        panel: "var(--shadow-panel)",
      },
      keyframes: {
        riseIn: {
          "0%": { opacity: 0, transform: "translateY(10px)" },
          "100%": { opacity: 1, transform: "translateY(0)" },
        },
      },
      animation: {
        riseIn: "riseIn 300ms ease-out both",
      },
    },
  },
  plugins: [],
};
