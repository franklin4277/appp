import { Router } from "express";
import rateLimit from "express-rate-limit";
import {
  createProfile,
  deleteProfile,
  disableMt5Integration,
  disableTwoFactor,
  enableTwoFactor,
  getEmailDeliveryStatus,
  generateMt5IntegrationKey,
  getMe,
  login,
  logout,
  confirmPasswordReset,
  requestEmailVerification,
  requestPasswordReset,
  refreshSession,
  register,
  sendEmailDeliveryTest,
  updateProfile,
  verifyEmail,
  verifyTwoFactorLogin,
  setActiveProfile,
  updateSettings,
} from "../controllers/authController.js";
import {
  applyAiAction,
  chatWithAi,
  clearAiConversation,
  getAiConfig,
  getAiConversation,
} from "../controllers/aiController.js";
import { requireAuth } from "../middleware/auth.js";
import {
  sanitizeInput,
  validateLoginPayload,
  validatePasswordResetConfirmPayload,
  validatePasswordResetRequestPayload,
  validateRegisterPayload,
} from "../middleware/validate.js";
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

const aiChatLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.AI_CHAT_RATE_LIMIT_MAX) || 120,
  standardHeaders: true,
  legacyHeaders: false,
  message: { message: "Too many AI chat requests. Please wait a moment and try again." },
  handler: (req, res) => {
    sendAlert({
      level: "warn",
      event: "ai.chat.rate.limit.hit",
      message: "AI chat rate limit exceeded.",
      details: {
        route: req.originalUrl,
      },
    });
    res.status(429).json({ message: "Too many AI chat requests. Please wait a moment and try again." });
  },
});

router.post("/register", registerLimiter, sanitizeInput, validateRegisterPayload, register);
router.post("/login", authLimiter, sanitizeInput, validateLoginPayload, login);
router.post("/2fa/verify-login", authLimiter, verifyTwoFactorLogin);
router.post("/refresh", authLimiter, refreshSession);
router.post("/logout", authLimiter, logout);
router.post(
  "/password-reset/request",
  recoveryLimiter,
  sanitizeInput,
  validatePasswordResetRequestPayload,
  requestPasswordReset
);
router.post(
  "/password-reset/confirm",
  recoveryLimiter,
  sanitizeInput,
  validatePasswordResetConfirmPayload,
  confirmPasswordReset
);
router.post("/email-verification/verify", recoveryLimiter, verifyEmail);
router.get("/me", requireAuth, getMe);
router.patch("/settings", requireAuth, updateSettings);
router.post("/integrations/mt5/key", requireAuth, authLimiter, generateMt5IntegrationKey);
router.post("/integrations/mt5/disable", requireAuth, authLimiter, disableMt5Integration);
router.post("/profiles", requireAuth, createProfile);
router.patch("/profiles/:profileId", requireAuth, updateProfile);
router.delete("/profiles/:profileId", requireAuth, deleteProfile);
router.patch("/profiles/active", requireAuth, setActiveProfile);
router.get("/ai/config", requireAuth, getAiConfig);
router.get("/ai/conversations/:profileId", requireAuth, getAiConversation);
router.delete("/ai/conversations/:profileId", requireAuth, clearAiConversation);
router.post("/ai/chat", requireAuth, aiChatLimiter, chatWithAi);
router.post("/ai/action", requireAuth, aiChatLimiter, applyAiAction);
router.post("/email-verification/request", requireAuth, recoveryLimiter, requestEmailVerification);
router.get("/email-delivery/status", requireAuth, getEmailDeliveryStatus);
router.post("/email-delivery/test", requireAuth, recoveryLimiter, sendEmailDeliveryTest);
router.post("/2fa/enable", requireAuth, authLimiter, enableTwoFactor);
router.post("/2fa/disable", requireAuth, authLimiter, disableTwoFactor);

export default router;
