import compression from "compression";
import cors from "cors";
import express from "express";
import helmet from "helmet";
import coachRouter from "./routes/coach.js";

const parseOrigins = (value = "") =>
  String(value || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeOrigin = (value = "") => String(value || "").trim().toLowerCase().replace(/\/$/, "");

export const createApp = () => {
  const app = express();
  const allowedOrigins = parseOrigins(process.env.CLIENT_URL).map(normalizeOrigin);
  const allowAnyOrigin = !allowedOrigins.length || allowedOrigins.includes("*");

  app.use(
    cors({
      origin(origin, callback) {
        if (!origin || allowAnyOrigin || allowedOrigins.includes(normalizeOrigin(origin))) {
          callback(null, true);
          return;
        }
        callback(new Error("Origin not allowed by Journex AI service."));
      },
    })
  );
  app.use(
    helmet({
      crossOriginResourcePolicy: false,
    })
  );
  app.use(
    compression({
      level: 5,
    })
  );
  app.use(express.json({ limit: "2mb" }));

  app.get("/api/health", (_req, res) => {
    res.json({
      ok: true,
      service: "journex-ai",
      provider: String(process.env.AI_PROVIDER_LABEL || "open-source-llm").trim() || "open-source-llm",
      model: String(process.env.AI_MODEL || "").trim() || "unset",
      time: new Date().toISOString(),
    });
  });

  app.use("/api/coach", coachRouter);

  app.use((error, _req, res, _next) => {
    const statusCode = Number(error?.statusCode || 500);
    res.status(statusCode).json({
      ok: false,
      message: error?.message || "Journex AI service error.",
    });
  });

  return app;
};
