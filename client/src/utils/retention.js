export const RETENTION_PREFERENCES_KEY = "trading-journal-retention-preferences";

export const DEFAULT_RETENTION_PREFERENCES = {
  dailyReminderEnabled: true,
  dailyReminderTime: "20:00",
  weeklyReportEnabled: true,
  weeklyReportDay: "Sunday",
  weeklyReportTime: "21:00",
  insightAlertsEnabled: true,
  desktopNotificationsEnabled: false,
};

const sanitizeTime = (value, fallback) => {
  const text = String(value || "").trim();
  if (/^\d{2}:\d{2}$/.test(text)) {
    return text;
  }
  return fallback;
};

export const readRetentionPreferences = () => {
  try {
    const raw = localStorage.getItem(RETENTION_PREFERENCES_KEY);
    if (!raw) {
      return { ...DEFAULT_RETENTION_PREFERENCES };
    }
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") {
      return { ...DEFAULT_RETENTION_PREFERENCES };
    }

    return {
      ...DEFAULT_RETENTION_PREFERENCES,
      ...parsed,
      dailyReminderTime: sanitizeTime(parsed.dailyReminderTime, DEFAULT_RETENTION_PREFERENCES.dailyReminderTime),
      weeklyReportTime: sanitizeTime(parsed.weeklyReportTime, DEFAULT_RETENTION_PREFERENCES.weeklyReportTime),
    };
  } catch {
    return { ...DEFAULT_RETENTION_PREFERENCES };
  }
};

export const writeRetentionPreferences = (value = {}) => {
  const next = {
    ...DEFAULT_RETENTION_PREFERENCES,
    ...value,
    dailyReminderTime: sanitizeTime(value.dailyReminderTime, DEFAULT_RETENTION_PREFERENCES.dailyReminderTime),
    weeklyReportTime: sanitizeTime(value.weeklyReportTime, DEFAULT_RETENTION_PREFERENCES.weeklyReportTime),
  };
  localStorage.setItem(RETENTION_PREFERENCES_KEY, JSON.stringify(next));
  return next;
};

export const dayNameToIndex = (value = "") => {
  const map = {
    sunday: 0,
    monday: 1,
    tuesday: 2,
    wednesday: 3,
    thursday: 4,
    friday: 5,
    saturday: 6,
  };
  return map[String(value || "").toLowerCase()] ?? 0;
};

export const dayKey = (date = new Date()) =>
  `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;

export const weekKey = (date = new Date()) => {
  const clone = new Date(date);
  const day = clone.getDay();
  clone.setDate(clone.getDate() - day);
  return `${clone.getFullYear()}-${clone.getMonth() + 1}-${clone.getDate()}`;
};

