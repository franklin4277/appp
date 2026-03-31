import { memo } from "react";

const SunIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
    <path
      d="M12 4V2m0 20v-2m8-8h2M2 12h2m13.66 5.66 1.42 1.42M2.92 4.92l1.42 1.42m0 11.32-1.42 1.42m14.74-14.74 1.42-1.42M16 12a4 4 0 1 1-8 0 4 4 0 0 1 8 0Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const MoonIcon = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4">
    <path
      d="M20 14.5A8.5 8.5 0 1 1 9.5 4a7 7 0 0 0 10.5 10.5Z"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

const ThemeToggle = ({ theme = "dark", onToggle, className = "" }) => {
  const darkMode = theme === "dark";
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`theme-toggle ${className}`.trim()}
      aria-label={darkMode ? "Switch to light mode" : "Switch to dark mode"}
      title={darkMode ? "Light mode" : "Dark mode"}
    >
      {darkMode ? <SunIcon /> : <MoonIcon />}
      <span>{darkMode ? "Light" : "Dark"}</span>
    </button>
  );
};

export default memo(ThemeToggle);

