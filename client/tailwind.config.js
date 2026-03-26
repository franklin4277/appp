/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0f172a",
        panel: "#0f172a",
        panelMuted: "#162238",
        border: "#25344f",
        textMain: "#e5ecf6",
        textMuted: "#9fb0ca",
        accent: "#314667",
        danger: "#415777",
      },
      boxShadow: {
        panel: "0 14px 35px rgba(6, 10, 24, 0.35)",
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
