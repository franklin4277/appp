import { Router } from "express";
import rateLimit from "express-rate-limit";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import {
  createTradeFromBridge,
  createTrade,
  createSharedWeeklyReview,
  exportTradesCsv,
  getAnalytics,
  getSharedWeeklyReview,
  getTradeById,
  getTrades,
  getWeeklyReview,
  importTradesCsv,
  listWeeklyReviewShares,
  revokeWeeklyReviewShare,
} from "../controllers/tradesController.js";
import { requireAuth } from "../middleware/auth.js";
import { sanitizeInput, validateTradeCreatePayload } from "../middleware/validate.js";
import { uploadCsvFile, uploadTradeScreenshots } from "../services/upload.js";
import { sendAlert } from "../services/alerts.js";

const router = Router();

const resolveBridgePath = (filename = "") => {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = path.dirname(__filename);
  const bridgeDir = path.resolve(__dirname, "../../../scripts/mt5-bridge");
  return path.join(bridgeDir, filename);
};

router.get("/bridge/mt5/guide", (req, res) => {
  const guidePath = resolveBridgePath("README.md");
  if (!fs.existsSync(guidePath)) {
    res.status(404).json({ message: "MT5 bridge setup guide not found." });
    return;
  }
  res.setHeader("Content-Type", "text/markdown; charset=utf-8");
  res.sendFile(guidePath);
});

router.get("/bridge/mt5/download", (req, res) => {
  const scriptPath = resolveBridgePath("mt5_auto_journal_bridge.py");
  if (!fs.existsSync(scriptPath)) {
    res.status(404).json({ message: "MT5 bridge script not found." });
    return;
  }
  res.download(scriptPath, "mt5_auto_journal_bridge.py");
});

const bridgeLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.BRIDGE_RATE_LIMIT_PER_MINUTE) || 240,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Bridge ingest rate limit reached. Retry shortly." },
  handler: (req, res) => {
    sendAlert({
      level: "warn",
      event: "bridge.rate.limit.hit",
      message: "MT5 bridge ingest rate limit exceeded.",
      details: {
        route: req.originalUrl,
      },
      source: "trades",
    });
    res.status(429).json({ message: "Bridge ingest rate limit reached. Retry shortly." });
  },
});

router.get("/review/shared/:token", getSharedWeeklyReview);
router.post("/bridge/mt5", bridgeLimiter, createTradeFromBridge);

router.use(requireAuth);

router.get("/", getTrades);
router.get("/analytics", getAnalytics);
router.get("/review/weekly", getWeeklyReview);
router.post("/review/share", createSharedWeeklyReview);
router.get("/review/shares", listWeeklyReviewShares);
router.delete("/review/share/:shareId", revokeWeeklyReviewShare);
router.get("/export.csv", exportTradesCsv);
router.get("/:tradeId", getTradeById);
router.post("/import.csv", uploadCsvFile.single("file"), importTradesCsv);
router.post(
  "/",
  sanitizeInput,
  validateTradeCreatePayload,
  uploadTradeScreenshots.fields([
    { name: "screenshotBefore", maxCount: 1 },
    { name: "screenshotAfter", maxCount: 1 },
  ]),
  createTrade
);

export default router;
