const ALERT_LEVELS = new Set(["info", "warn", "error"]);
const DELIVERY_TIMEOUT_MS = 8000;

const normalizeLevel = (value) => (ALERT_LEVELS.has(value) ? value : "info");

const shouldSendAlerts = () => Boolean(process.env.ALERT_WEBHOOK_URL);

export const sendAlert = async ({
  level = "info",
  event = "",
  message = "",
  details = {},
  source = "api",
} = {}) => {
  const payload = {
    level: normalizeLevel(level),
    event: String(event || "app.event"),
    message: String(message || ""),
    source,
    time: new Date().toISOString(),
    details: details && typeof details === "object" ? details : {},
  };

  const logPrefix = `[ALERT:${payload.level.toUpperCase()}] ${payload.event}`;
  if (payload.level === "error") {
    console.error(logPrefix, payload.message, payload.details);
  } else if (payload.level === "warn") {
    console.warn(logPrefix, payload.message, payload.details);
  } else {
    console.log(logPrefix, payload.message, payload.details);
  }

  if (!shouldSendAlerts()) {
    return;
  }

  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), DELIVERY_TIMEOUT_MS);
    try {
      await fetch(process.env.ALERT_WEBHOOK_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timer);
    }
  } catch (error) {
    console.warn("Alert webhook delivery failed:", error.message);
  }
};
