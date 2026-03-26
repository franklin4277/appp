import { Router } from "express";
import {
  createTrade,
  exportTradesCsv,
  getAnalytics,
  getTrades,
  importTradesCsv,
} from "../controllers/tradesController.js";
import { requireAuth } from "../middleware/auth.js";
import { uploadCsvFile, uploadTradeScreenshots } from "../services/upload.js";

const router = Router();

router.use(requireAuth);

router.get("/", getTrades);
router.get("/analytics", getAnalytics);
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
