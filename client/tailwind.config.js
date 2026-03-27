/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0b1220",
        panel: "#101a2b",
        panelMuted: "#17253d",
        border: "#2b3c5b",
        textMain: "#e8eef9",
        textMuted: "#9fb0ca",
        accent: "#6d88af",
        danger: "#d07e85",
      },
      boxShadow: {
        panel: "0 16px 34px rgba(6, 12, 25, 0.42)",
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
