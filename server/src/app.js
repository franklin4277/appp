import cors from "cors";
import compression from "compression";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import authRouter from "./routes/auth.js";
import tradesRouter from "./routes/trades.js";
import { logError, logInfo } from "./services/logger.js";
import { sendAlert } from "./services/alerts.js";
import { getMetricsSnapshot, metricsMiddleware } from "./services/metrics.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const trustProxyRaw = String(
  process.env.TRUST_PROXY !== undefined
    ? process.env.TRUST_PROXY
    : process.env.NODE_ENV === "production"
      ? "1"
      : ""
)
  .trim()
  .toLowerCase();

if (trustProxyRaw) {
  if (["false", "0", "off", "no"].includes(trustProxyRaw)) {
    app.set("trust proxy", false);
  } else if (["true", "1", "on", "yes"].includes(trustProxyRaw)) {
    app.set("trust proxy", 1);
  } else {
    app.set("trust proxy", trustProxyRaw);
  }
}

const parseOrigins = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeOrigin = (value = "") => String(value || "").trim().toLowerCase().replace(/\/$/, "");

const configuredOrigins = parseOrigins(process.env.CLIENT_URL);
const allowedOrigins = configuredOrigins.map(normalizeOrigin);
const allowAnyOrigin = allowedOrigins.length === 0 || allowedOrigins.includes("*");
const strictCors =
  process.env.STRICT_CORS === undefined
    ? process.env.NODE_ENV === "production"
    : process.env.STRICT_CORS === "true";

if (strictCors && allowAnyOrigin) {
  logInfo("security.cors.strict_requires_client_url", {
    strictCors,
    configuredClientUrl: String(process.env.CLIENT_URL || ""),
  });
}

const metricsToken = String(process.env.METRICS_TOKEN || "").trim();
const jsonBodyLimit = String(process.env.JSON_BODY_LIMIT || "12mb").trim() || "12mb";

const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  if (allowAnyOrigin) {
    // In strict mode, wildcard/no CLIENT_URL is not accepted for browser origins.
    // This blocks cross-origin requests until a concrete CLIENT_URL is configured.
    return !strictCors;
  }

  if (!strictCors) {
    return true;
  }

  const normalized = normalizeOrigin(origin);
  if (allowedOrigins.includes(normalized)) {
    return true;
  }

  // Optional wildcard support, e.g. "*.onrender.com"
  return allowedOrigins.some((pattern) => {
    if (!pattern.startsWith("*.")) {
      return false;
    }
    const suffix = pattern.slice(1); // ".onrender.com"
    return normalized.endsWith(suffix);
  });
};

app.use(
  cors({
    origin(origin, callback) {
      if (isOriginAllowed(origin)) {
        callback(null, true);
        return;
      }
      callback(new Error("Origin not allowed by CORS policy."));
    },
    credentials: false,
  })
);
app.use(
  compression({
    // Favor speed over max compression; helps large analytics/trade payloads.
    level: 5,
  })
);
app.use(
  helmet({
    crossOriginResourcePolicy: false,
  })
);
app.use(
  "/api",
  rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.API_RATE_LIMIT_MAX) || 500,
    standardHeaders: true,
    legacyHeaders: false,
  })
);
app.use(
  express.json({
    limit: jsonBodyLimit,
    verify: (req, _res, buffer) => {
      req.rawBody = buffer?.toString("utf8") || "";
    },
  })
);
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  const existing = String(req.headers["x-request-id"] || "").trim();
  const requestId = existing || Math.random().toString(36).slice(2, 12);
  res.setHeader("x-request-id", requestId);
  req.requestId = requestId;
  const startedAt = Date.now();
  res.on("finish", () => {
    logInfo("http.request.completed", {
      requestId,
      method: req.method,
      path: String(req.originalUrl || req.url || "").split("?")[0],
      statusCode: res.statusCode,
      latencyMs: Math.max(Date.now() - startedAt, 0),
      ip: req.ip,
      userAgent: req.headers["user-agent"] || "",
    });
  });
  next();
});
app.use(metricsMiddleware);

const exposeLocalUploads =
  process.env.EXPOSE_LOCAL_UPLOADS === "true" || process.env.NODE_ENV !== "production";

if (exposeLocalUploads) {
  app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));
} else {
  logInfo("storage.local_uploads.hidden", {
    reason: "EXPOSE_LOCAL_UPLOADS=false in production",
  });
}

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "forex-journal-api",
    time: new Date().toISOString(),
  });
});

app.get("/api/metrics", (req, res) => {
  if (metricsToken) {
    const providedToken = String(req.headers["x-metrics-token"] || req.query.token || "").trim();
    if (!providedToken || providedToken !== metricsToken) {
      res.status(401).json({
        message: "Metrics token is required.",
      });
      return;
    }
  }

  res.json(getMetricsSnapshot());
});

app.use("/api/auth", authRouter);
app.use("/api/trades", tradesRouter);

app.use((error, req, res, _next) => {
  const statusCode = error.statusCode || 500;
  const requestId = String(req.requestId || res.getHeader("x-request-id") || "");
  logError("http.request.failed", {
    requestId,
    statusCode,
    method: req.method,
    path: String(req.originalUrl || req.url || "").split("?")[0],
    message: error.message || "Unhandled server error.",
    stack: process.env.NODE_ENV === "production" ? "" : error.stack || "",
  });
  if (statusCode >= 500) {
    sendAlert({
      level: "error",
      event: "api.unhandled.error",
      message: error.message || "Unhandled server error.",
      details: {
        statusCode,
        requestId,
      },
    });
  }
  res.status(error.statusCode || 500).json({
    message: error.message || "Internal server error",
    requestId,
  });
});

export default app;
