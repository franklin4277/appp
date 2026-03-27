import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  createProfile,
  getMe,
  login,
  logout,
  refreshSession,
  register,
  setActiveProfile,
  updateSettings,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many auth attempts. Try again in a few minutes." },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.REGISTER_RATE_LIMIT_MAX) || 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many sign up attempts. Please try later." },
});

router.post("/register", registerLimiter, register);
router.post("/login", authLimiter, login);
router.post("/refresh", authLimiter, refreshSession);
router.post("/logout", authLimiter, logout);
router.get("/me", requireAuth, getMe);
router.patch("/settings", requireAuth, updateSettings);
router.post("/profiles", requireAuth, createProfile);
router.patch("/profiles/active", requireAuth, setActiveProfile);

export default router;
