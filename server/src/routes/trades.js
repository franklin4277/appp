import { Router } from "express";
import {
  createTrade,
  getAnalytics,
  getTrades,
} from "../controllers/tradesController.js";
import { uploadTradeScreenshots } from "../services/upload.js";

const router = Router();

router.get("/", getTrades);
router.get("/analytics", getAnalytics);
router.post(
  "/",
  uploadTradeScreenshots.fields([
    { name: "screenshotBefore", maxCount: 1 },
    { name: "screenshotAfter", maxCount: 1 },
  ]),
  createTrade
);

export default router;
