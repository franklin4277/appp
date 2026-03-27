import { sendAlert } from "./alerts.js";

const FAILED_LOGIN_WINDOW_MS = 15 * 60 * 1000;
const FAILED_LOGIN_COOLDOWN_MS = 10 * 60 * 1000;
const DEFAULT_FAILED_LOGIN_THRESHOLD = 20;

const failedLoginBuckets = new Map();

const nowTs = () => Date.now();

const sourceKeyFromRequest = (req, email = "") => {
  const ip = String(
    req?.headers?.["x-forwarded-for"]?.split?.(",")?.[0]?.trim?.() ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      ""
  ).slice(0, 80);
  const normalizedEmail = String(email || "").trim().toLowerCase();
  return `${ip}|${normalizedEmail}`;
};

const thresholdValue = () => {
  const envThreshold = Number(process.env.FAILED_LOGIN_ALERT_THRESHOLD || "");
  if (Number.isFinite(envThreshold) && envThreshold > 0) {
    return envThreshold;
  }
  return DEFAULT_FAILED_LOGIN_THRESHOLD;
};

const cleanupStaleBuckets = (time) => {
  for (const [key, value] of failedLoginBuckets.entries()) {
    if (time - value.lastAt > FAILED_LOGIN_WINDOW_MS * 2) {
      failedLoginBuckets.delete(key);
    }
  }
};

export const trackFailedLoginAttempt = ({ req, email = "" }) => {
  const ts = nowTs();
  cleanupStaleBuckets(ts);

  const key = sourceKeyFromRequest(req, email);
  const previous = failedLoginBuckets.get(key);

  const withinWindow = previous && ts - previous.firstAt <= FAILED_LOGIN_WINDOW_MS;
  const bucket = withinWindow
    ? {
        ...previous,
        count: previous.count + 1,
        lastAt: ts,
      }
    : {
        count: 1,
        firstAt: ts,
        lastAt: ts,
        lastAlertAt: 0,
      };

  failedLoginBuckets.set(key, bucket);

  const threshold = thresholdValue();
  const shouldAlert = bucket.count >= threshold && ts - bucket.lastAlertAt >= FAILED_LOGIN_COOLDOWN_MS;
  if (!shouldAlert) {
    return;
  }

  bucket.lastAlertAt = ts;
  failedLoginBuckets.set(key, bucket);

  sendAlert({
    level: "warn",
    event: "auth.login.failed.burst",
    message: `High failed login volume detected (${bucket.count} attempts in last 15 minutes).`,
    details: {
      threshold,
      email: String(email || "").slice(0, 120),
    },
  });
};
