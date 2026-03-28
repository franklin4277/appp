import { sendAlert } from "./alerts.js";

const MAX_PATH_KEYS = 250;
const MAX_RECENT_REQUESTS = 180;
const ERROR_ALERT_WINDOW_MS = 5 * 60 * 1000;
const DEFAULT_ERROR_ALERT_THRESHOLD = 12;
const ALERT_COOLDOWN_MS = 2 * 60 * 1000;

const metricsState = {
  startedAt: new Date(),
  requestsTotal: 0,
  statusCounts: {},
  methodCounts: {},
  pathCounts: {},
  latencyMs: {
    total: 0,
    samples: 0,
    max: 0,
  },
  recentRequests: [],
  recentErrors: [],
  lastErrorAlertAt: 0,
};

const incrementCount = (bucket, key) => {
  bucket[key] = (bucket[key] || 0) + 1;
};

const normalizePath = (value = "") =>
  String(value || "")
    .split("?")[0]
    .replace(/\/\d+(?=\/|$)/g, "/:id")
    .replace(/[a-f0-9]{24}(?=\/|$)/gi, ":id");

const trimPathCounts = () => {
  const keys = Object.keys(metricsState.pathCounts);
  if (keys.length <= MAX_PATH_KEYS) {
    return;
  }
  keys
    .sort((a, b) => metricsState.pathCounts[a] - metricsState.pathCounts[b])
    .slice(0, keys.length - MAX_PATH_KEYS)
    .forEach((key) => {
      delete metricsState.pathCounts[key];
    });
};

const getErrorThreshold = () => {
  const envValue = Number(process.env.ERROR_ALERT_THRESHOLD || "");
  if (Number.isFinite(envValue) && envValue > 0) {
    return envValue;
  }
  return DEFAULT_ERROR_ALERT_THRESHOLD;
};

const pruneRecentErrors = (nowTs) => {
  metricsState.recentErrors = metricsState.recentErrors.filter((value) => nowTs - value <= ERROR_ALERT_WINDOW_MS);
};

const pushRecentRequest = (item) => {
  metricsState.recentRequests.push(item);
  if (metricsState.recentRequests.length > MAX_RECENT_REQUESTS) {
    metricsState.recentRequests = metricsState.recentRequests.slice(
      metricsState.recentRequests.length - MAX_RECENT_REQUESTS
    );
  }
};

const maybeAlertErrorBurst = (statusCode, method, path, reqId = "") => {
  if (statusCode < 500) {
    return;
  }

  const nowTs = Date.now();
  metricsState.recentErrors.push(nowTs);
  pruneRecentErrors(nowTs);

  const threshold = getErrorThreshold();
  const burst = metricsState.recentErrors.length;
  const elapsedSinceAlert = nowTs - metricsState.lastErrorAlertAt;

  if (burst < threshold || elapsedSinceAlert < ALERT_COOLDOWN_MS) {
    return;
  }

  metricsState.lastErrorAlertAt = nowTs;
  sendAlert({
    level: "error",
    event: "api.error.burst",
    message: `High 5xx volume detected (${burst} errors in last 5 minutes).`,
    details: {
      threshold,
      latest: {
        statusCode,
        method,
        path,
        reqId,
      },
    },
  });
};

export const metricsMiddleware = (req, res, next) => {
  const started = Date.now();
  const method = String(req.method || "GET").toUpperCase();
  const path = normalizePath(req.originalUrl || req.url || "/");

  res.on("finish", () => {
    const latency = Math.max(Date.now() - started, 0);
    const statusCode = Number(res.statusCode) || 0;
    const statusClass = `${Math.floor(statusCode / 100)}xx`;

    metricsState.requestsTotal += 1;
    incrementCount(metricsState.methodCounts, method);
    incrementCount(metricsState.statusCounts, String(statusCode));
    incrementCount(metricsState.statusCounts, statusClass);
    incrementCount(metricsState.pathCounts, `${method} ${path}`);
    trimPathCounts();

    metricsState.latencyMs.total += latency;
    metricsState.latencyMs.samples += 1;
    metricsState.latencyMs.max = Math.max(metricsState.latencyMs.max, latency);

    const requestId = String(res.getHeader("x-request-id") || req.headers["x-request-id"] || "");
    pushRecentRequest({
      at: new Date().toISOString(),
      requestId,
      method,
      path,
      statusCode,
      latencyMs: latency,
    });
    maybeAlertErrorBurst(statusCode, method, path, requestId);
  });

  next();
};

const averageLatency = () => {
  if (!metricsState.latencyMs.samples) {
    return 0;
  }
  return Math.round((metricsState.latencyMs.total / metricsState.latencyMs.samples) * 10) / 10;
};

const topEntries = (bucket = {}, limit = 12) =>
  Object.entries(bucket)
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([key, value]) => ({ key, value }));

export const getMetricsSnapshot = () => {
  pruneRecentErrors(Date.now());
  return {
    startedAt: metricsState.startedAt.toISOString(),
    uptimeSeconds: Math.floor((Date.now() - metricsState.startedAt.getTime()) / 1000),
    requestsTotal: metricsState.requestsTotal,
    requestsByMethod: topEntries(metricsState.methodCounts),
    requestsByStatus: topEntries(metricsState.statusCounts, 20),
    topPaths: topEntries(metricsState.pathCounts, 20),
    latencyMs: {
      average: averageLatency(),
      max: metricsState.latencyMs.max,
      samples: metricsState.latencyMs.samples,
    },
    recentServerErrors: metricsState.recentErrors.length,
    windowMinutes: Math.floor(ERROR_ALERT_WINDOW_MS / 60_000),
    recentRequests: [...metricsState.recentRequests].reverse().slice(0, 40),
  };
};
