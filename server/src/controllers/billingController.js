import { recordAudit } from "../services/audit.js";
import {
  billingProviderReady,
  buildCheckoutSession,
  buildPortalSession,
  findPlanById,
  listPlans,
} from "../services/billing.js";
import { toPublicUser } from "../services/auth.js";

const toText = (value = "") => String(value || "").trim();

export const getBillingOverview = async (req, res, next) => {
  try {
    const user = req.user;
    res.json({
      plans: listPlans(),
      providerReady: billingProviderReady(),
      subscription: user.subscription || null,
    });
  } catch (error) {
    next(error);
  }
};

export const createCheckoutSession = async (req, res, next) => {
  try {
    const user = req.user;
    const planId = toText(req.body?.planId).toLowerCase();
    const successUrl = toText(req.body?.successUrl);
    const cancelUrl = toText(req.body?.cancelUrl);

    const plan = findPlanById(planId);
    if (!plan) {
      const error = new Error("Invalid subscription plan.");
      error.statusCode = 400;
      throw error;
    }

    const session = await buildCheckoutSession({
      user,
      plan,
      successUrl,
      cancelUrl,
    });

    await recordAudit({
      req,
      userId: user._id,
      action: "billing.checkout.created",
      targetType: "billing",
      metadata: {
        planId: plan.id,
        provider: session.provider,
      },
    });

    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
};

export const createBillingPortalSession = async (req, res, next) => {
  try {
    const session = await buildPortalSession({
      user: req.user,
      returnUrl: toText(req.body?.returnUrl),
    });

    await recordAudit({
      req,
      userId: req.user._id,
      action: "billing.portal.created",
      targetType: "billing",
      metadata: {
        provider: session.provider,
      },
    });

    res.status(201).json(session);
  } catch (error) {
    next(error);
  }
};

export const setSubscriptionPlanForTesting = async (req, res, next) => {
  try {
    const user = req.user;
    const planId = toText(req.body?.planId).toLowerCase();
    const status = toText(req.body?.status || "active").toLowerCase();
    const plan = findPlanById(planId);
    if (!plan) {
      const error = new Error("Invalid planId.");
      error.statusCode = 400;
      throw error;
    }

    if (!["active", "trialing", "past_due", "canceled", "incomplete"].includes(status)) {
      const error = new Error("Invalid subscription status.");
      error.statusCode = 400;
      throw error;
    }

    user.subscription = {
      ...(user.subscription || {}),
      planId: plan.id,
      status,
      provider: "manual",
      updatedAt: new Date(),
    };
    await user.save();

    await recordAudit({
      req,
      userId: user._id,
      action: "billing.subscription.mock.updated",
      targetType: "billing",
      metadata: {
        planId: plan.id,
        status,
      },
    });

    res.json({
      ok: true,
      user: toPublicUser(user),
    });
  } catch (error) {
    next(error);
  }
};

