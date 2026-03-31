import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  createTradeFromBridge,
  createTrade,
  createSharedWeeklyReview,
  exportTradesCsv,
  getAnalytics,
  getSharedWeeklyReview,
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
