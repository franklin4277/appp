export const SUBSCRIPTION_PLANS = [
  {
    id: "starter",
    name: "Starter",
    priceMonthly: 0,
    currency: "USD",
    badge: "Free",
    features: [
      "Single profile",
      "Core journaling",
      "Basic analytics",
      "Offline queue",
    ],
  },
  {
    id: "pro",
    name: "Pro",
    priceMonthly: 19,
    currency: "USD",
    badge: "Most Popular",
    features: [
      "Unlimited profiles",
      "Advanced analytics",
      "Behavior coaching insights",
      "MT5 bridge automation",
      "Priority support",
    ],
  },
  {
    id: "team",
    name: "Team",
    priceMonthly: 59,
    currency: "USD",
    badge: "Scale",
    features: [
      "Everything in Pro",
      "Shared workspaces",
      "Team performance reports",
      "Admin controls",
      "Dedicated onboarding",
    ],
  },
];

export const DEFAULT_SUBSCRIPTION = {
  planId: "starter",
  status: "active",
  provider: "manual",
  customerId: "",
  subscriptionId: "",
  currentPeriodEnd: null,
  cancelAtPeriodEnd: false,
  updatedAt: null,
};

