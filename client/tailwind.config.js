/** @type {import('tailwindcss').Config} */
export default {
  content: ["./index.html", "./src/**/*.{js,jsx,ts,tsx}"],
  theme: {
    extend: {
      colors: {
        background: "#0f1727",
        panel: "#111a2e",
        panelMuted: "#1a2742",
        border: "#314667",
        textMain: "#e9eef8",
        textMuted: "#9badcb",
        accent: "#ff9f43",
        danger: "#ef6f6c",
      },
      boxShadow: {
        panel: "0 14px 35px rgba(6, 10, 24, 0.45)",
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
