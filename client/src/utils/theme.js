export const THEME_STORAGE_KEY = "trading-journal-theme";

const isValidTheme = (value = "") => ["dark", "light"].includes(String(value).toLowerCase());

export const resolveInitialTheme = () => {
  const stored = String(localStorage.getItem(THEME_STORAGE_KEY) || "").toLowerCase();
  if (isValidTheme(stored)) {
    return stored;
  }

  if (typeof window !== "undefined" && window.matchMedia) {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  }

  return "dark";
};

export const applyTheme = (theme = "dark") => {
  const safeTheme = isValidTheme(theme) ? String(theme).toLowerCase() : "dark";
  document.documentElement.dataset.theme = safeTheme;
  localStorage.setItem(THEME_STORAGE_KEY, safeTheme);

  const themeColor = safeTheme === "dark" ? "#0f172a" : "#e9f1fb";
  const meta = document.querySelector('meta[name="theme-color"]');
  if (meta) {
    meta.setAttribute("content", themeColor);
  }
};

