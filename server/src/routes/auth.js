import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  createProfile,
  disableTwoFactor,
  enableTwoFactor,
  getEmailDeliveryStatus,
  getMe,
  login,
  logout,
  confirmPasswordReset,
  requestEmailVerification,
  requestPasswordReset,
  refreshSession,
  register,
  sendEmailDeliveryTest,
  verifyEmail,
  verifyTwoFactorLogin,
  setActiveProfile,
  updateSettings,
} from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";
import { sendAlert } from "../services/alerts.js";

const router = Router();

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AUTH_RATE_LIMIT_MAX) || 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many auth attempts. Try again in a few minutes." },
  handler: (req, res) => {
    sendAlert({
      level: "warn",
      event: "auth.rate.limit.hit",
      message: "Authentication rate limit exceeded.",
      details: {
        route: req.originalUrl,
      },
    });
    res.status(429).json({ message: "Too many auth attempts. Try again in a few minutes." });
  },
});

const registerLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.REGISTER_RATE_LIMIT_MAX) || 12,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many sign up attempts. Please try later." },
});

const recoveryLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RECOVERY_RATE_LIMIT_MAX) || 20,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many recovery attempts. Please try again later." },
});

router.post("/register", registerLimiter, register);
router.post("/login", authLimiter, login);
router.post("/2fa/verify-login", authLimiter, verifyTwoFactorLogin);
router.post("/refresh", authLimiter, refreshSession);
router.post("/logout", authLimiter, logout);
router.post("/password-reset/request", recoveryLimiter, requestPasswordReset);
router.post("/password-reset/confirm", recoveryLimiter, confirmPasswordReset);
router.post("/email-verification/verify", recoveryLimiter, verifyEmail);
router.get("/me", requireAuth, getMe);
router.patch("/settings", requireAuth, updateSettings);
router.post("/profiles", requireAuth, createProfile);
router.patch("/profiles/active", requireAuth, setActiveProfile);
router.post("/email-verification/request", requireAuth, recoveryLimiter, requestEmailVerification);
router.get("/email-delivery/status", requireAuth, getEmailDeliveryStatus);
router.post("/email-delivery/test", requireAuth, recoveryLimiter, sendEmailDeliveryTest);
router.post("/2fa/enable", requireAuth, authLimiter, enableTwoFactor);
router.post("/2fa/disable", requireAuth, authLimiter, disableTwoFactor);

export default router;
