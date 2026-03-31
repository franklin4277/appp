import crypto from "crypto";
import { SUBSCRIPTION_PLANS } from "../constants/plans.js";

const toText = (value = "") => String(value || "").trim();

export const listPlans = () => SUBSCRIPTION_PLANS.map((plan) => ({ ...plan }));

export const findPlanById = (planId = "") =>
  SUBSCRIPTION_PLANS.find((plan) => plan.id === toText(planId).toLowerCase());

export const billingProviderReady = () => {
  const provider = toText(process.env.BILLING_PROVIDER || "stripe").toLowerCase();
  if (provider !== "stripe") {
    return false;
  }
  return Boolean(toText(process.env.STRIPE_SECRET_KEY));
};

export const buildCheckoutSession = async ({ user, plan, successUrl, cancelUrl }) => {
  const provider = toText(process.env.BILLING_PROVIDER || "stripe").toLowerCase() || "stripe";
  if (provider !== "stripe") {
    const error = new Error("Only Stripe provider is currently scaffolded.");
    error.statusCode = 400;
    throw error;
  }

  const secretKey = toText(process.env.STRIPE_SECRET_KEY);
  if (!secretKey) {
    const error = new Error("Stripe is not configured. Add STRIPE_SECRET_KEY.");
    error.statusCode = 503;
    throw error;
  }

  // Production scaffold:
  // Replace this signed placeholder URL with real Stripe Checkout session creation
  // once Stripe SDK is wired. Keeping this deterministic contract makes frontend integration stable.
  const token = crypto
    .createHash("sha256")
    .update(`${user._id}:${plan.id}:${Date.now()}:${secretKey.slice(0, 8)}`)
    .digest("hex")
    .slice(0, 32);

  return {
    provider: "stripe",
    checkoutUrl: `${toText(process.env.STRIPE_CHECKOUT_BASE_URL || "https://checkout.stripe.com/pay")}/${token}`,
    successUrl: toText(successUrl),
    cancelUrl: toText(cancelUrl),
    planId: plan.id,
  };
};

export const buildPortalSession = async ({ user, returnUrl }) => {
  const secretKey = toText(process.env.STRIPE_SECRET_KEY);
  if (!secretKey) {
    const error = new Error("Stripe is not configured. Add STRIPE_SECRET_KEY.");
    error.statusCode = 503;
    throw error;
  }

  const token = crypto
    .createHash("sha256")
    .update(`${user._id}:${Date.now()}:${secretKey.slice(0, 8)}`)
    .digest("hex")
    .slice(0, 32);

  return {
    provider: "stripe",
    portalUrl: `${toText(process.env.STRIPE_PORTAL_BASE_URL || "https://billing.stripe.com/p/login")}/${token}`,
    returnUrl: toText(returnUrl),
  };
};

