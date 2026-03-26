import cors from "cors";
import express from "express";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import path from "path";
import { fileURLToPath } from "url";
import authRouter from "./routes/auth.js";
import tradesRouter from "./routes/trades.js";

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

const isOriginAllowed = (origin) => {
  if (!origin) {
    return true;
  }

  if (allowAnyOrigin) {
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

app.use("/uploads", express.static(path.resolve(__dirname, "../uploads")));

app.get("/api/health", (_req, res) => {
  res.json({
    ok: true,
    service: "forex-journal-api",
    time: new Date().toISOString(),
  });
});

app.use("/api/auth", authRouter);
app.use("/api/trades", tradesRouter);

app.use((error, _req, res, _next) => {
  console.error(error);
  res.status(error.statusCode || 500).json({
    message: error.message || "Internal server error",
  });
});

export default app;
