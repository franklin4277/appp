export const PAGES = [
  { key: "dashboard", label: "Dashboard", group: "Core", nav: true, mobile: true },
  { key: "journal", label: "Add Trade", group: "Core", nav: true, mobile: true },
  { key: "analytics", label: "Analytics", group: "Core", nav: true, mobile: true },
  { key: "edge", label: "Edge Detection", group: "Review", nav: true, mobile: true },
  { key: "behavior", label: "Behavior", group: "Review", nav: true, mobile: true },
  { key: "review", label: "Review", group: "Review", nav: true, mobile: true },
  { key: "ai", label: "AI Coach", group: "Review", nav: true, mobile: true },
  { key: "coaching", label: "Coaching", group: "Review", nav: true, mobile: true },
  { key: "replay", label: "Replay", group: "Review", nav: true, mobile: true },
  { key: "playbooks", label: "Playbooks", group: "Setup", nav: true, mobile: true },
  { key: "risk", label: "Risk Center", group: "Setup", nav: true, mobile: true },
  { key: "settings", label: "Settings", group: "Setup", nav: true, mobile: true },
  { key: "trade-detail", label: "Trade Detail", group: "Review", nav: false, mobile: false },
];

export const NAV_PAGES = PAGES.filter((page) => page.nav !== false);
export const PAGE_SHORTCUTS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0"];

export const PAGE_STORAGE_KEY = "trading-journal-active-page";
export const GROUP_PAGE_STORAGE_KEY = "trading-journal-last-pages-by-group";
export const ADVANCED_ANALYTICS_STORAGE_KEY = "trading-journal-advanced-analytics";
