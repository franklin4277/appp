import { Router } from "express";
import {
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
import { uploadCsvFile, uploadTradeScreenshots } from "../services/upload.js";

const router = Router();

router.get("/review/shared/:token", getSharedWeeklyReview);

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
  uploadTradeScreenshots.fields([
    { name: "screenshotBefore", maxCount: 1 },
    { name: "screenshotAfter", maxCount: 1 },
  ]),
  createTrade
);

export default router;
