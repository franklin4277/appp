import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import authRouter from "./routes/auth.js";
import tradesRouter from "./routes/trades.js";
import { sendAlert } from "./services/alerts.js";
import { getMetricsSnapshot, metricsMiddleware } from "./services/metrics.js";

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const parseOrigins = (value) =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeOrigin = (value = "") => String(value || "").trim().toLowerCase().replace(/\/$/, "");

const configuredOrigins = parseOrigins(process.env.CLIENT_URL);
const allowedOrigins = configuredOrigins.map(normalizeOrigin);
const allowAnyOrigin = allowedOrigins.length === 0 || allowedOrigins.includes("*");
const strictCors = process.env.STRICT_CORS === "true";

const metricsToken = String(process.env.METRICS_TOKEN || "").trim();

const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  if (allowAnyOrigin) {
    return true;
  }

  // Default mode favors reliability across changing frontend deploy URLs.
  // Set STRICT_CORS=true to enforce only configured CLIENT_URL origins.
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
app.use(express.json({ limit: "2mb" }));
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  const existing = String(req.headers["x-request-id"] || "").trim();
  const requestId = existing || Math.random().toString(36).slice(2, 12);
  res.setHeader("x-request-id", requestId);
  req.requestId = requestId;
  next();
});
app.use(metricsMiddleware);

app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

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

app.use((error, _req, res, _next) => {
  console.error(error);
  const statusCode = error.statusCode || 500;
  if (statusCode >= 500) {
    sendAlert({
      level: "error",
      event: "api.unhandled.error",
      message: error.message || "Unhandled server error.",
      details: {
        statusCode,
      },
    });
  }
  res.status(error.statusCode || 500).json({
    message: error.message || "Internal server error",
  });
});

export default app;
