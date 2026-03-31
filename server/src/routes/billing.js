import { Router } from "express";
import {
  createBillingPortalSession,
  createCheckoutSession,
  getBillingOverview,
  setSubscriptionPlanForTesting,
} from "../controllers/billingController.js";
import { requireAuth } from "../middleware/auth.js";
import {
  sanitizeInput,
  validateBillingCheckoutPayload,
  validateBillingMockPayload,
  validateBillingPortalPayload,
} from "../middleware/validate.js";

const router = Router();

router.use(requireAuth);

router.get("/overview", getBillingOverview);
router.post("/checkout-session", sanitizeInput, validateBillingCheckoutPayload, createCheckoutSession);
router.post("/portal-session", sanitizeInput, validateBillingPortalPayload, createBillingPortalSession);
router.post("/subscription/mock", sanitizeInput, validateBillingMockPayload, setSubscriptionPlanForTesting);

export default router;
