import { memo, useEffect, useState } from "react";
import {
  createCheckoutSession,
  createPortalSession,
  fetchBillingOverview,
  setMockSubscriptionPlan,
} from "../api/tradesApi";

const BillingPanel = ({ token, user, onUserUpdate }) => {
  const [loading, setLoading] = useState(false);
  const [busyPlanId, setBusyPlanId] = useState("");
  const [overview, setOverview] = useState({
    plans: [],
    providerReady: false,
    subscription: null,
  });
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");

  const loadOverview = async () => {
    setLoading(true);
    setError("");
    try {
      const data = await fetchBillingOverview(token);
      setOverview({
        plans: Array.isArray(data?.plans) ? data.plans : [],
        providerReady: Boolean(data?.providerReady),
        subscription: data?.subscription || null,
      });
    } catch (loadError) {
      setError(loadError.message || "Could not load billing overview.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadOverview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  const handleStartCheckout = async (planId) => {
    setBusyPlanId(planId);
    setError("");
    setMessage("");
    try {
      const payload = await createCheckoutSession(token, {
        planId,
        successUrl: `${window.location.origin}/billing/success`,
        cancelUrl: `${window.location.origin}/billing/cancel`,
      });
      if (payload.checkoutUrl) {
        window.open(payload.checkoutUrl, "_blank", "noopener,noreferrer");
        setMessage("Checkout session created. Complete payment in the opened tab.");
      } else {
        setMessage("Checkout scaffold is ready. Connect live Stripe session creation next.");
      }
    } catch (checkoutError) {
      setError(checkoutError.message || "Could not create checkout session.");
    } finally {
      setBusyPlanId("");
    }
  };

  const handleOpenPortal = async () => {
    setBusyPlanId("portal");
    setError("");
    setMessage("");
    try {
      const payload = await createPortalSession(token, {
        returnUrl: window.location.origin,
      });
      if (payload.portalUrl) {
        window.open(payload.portalUrl, "_blank", "noopener,noreferrer");
        setMessage("Billing portal opened in a new tab.");
      } else {
        setMessage("Portal scaffold is ready. Connect live Stripe portal session next.");
      }
    } catch (portalError) {
      setError(portalError.message || "Could not open billing portal.");
    } finally {
      setBusyPlanId("");
    }
  };

  const handleMockUpgrade = async (planId) => {
    setBusyPlanId(`mock-${planId}`);
    setError("");
    setMessage("");
    try {
      const payload = await setMockSubscriptionPlan(token, {
        planId,
        status: "active",
      });
      if (payload?.user) {
        onUserUpdate(payload.user);
      }
      await loadOverview();
      setMessage(`Plan updated to ${planId} (demo mode).`);
    } catch (mockError) {
      setError(mockError.message || "Could not update demo plan.");
    } finally {
      setBusyPlanId("");
    }
  };

  const currentPlan = overview.subscription?.planId || user?.subscription?.planId || "starter";
  const currentStatus = overview.subscription?.status || user?.subscription?.status || "active";

  return (
    <section className="panel animate-riseIn">
      <div className="section-title">
        <h2>Billing & Plans</h2>
        <p>SaaS monetization</p>
      </div>
      <p className="text-sm text-textMuted">
        Current plan: <span className="font-medium text-textMain">{currentPlan}</span> · status{" "}
        <span className="font-medium text-textMain">{currentStatus}</span>
      </p>
      <p className="mt-1 text-xs text-textMuted">
        Provider: Stripe scaffold {overview.providerReady ? "configured" : "not configured yet"}.
      </p>

      <div className="mt-3 grid grid-cols-1 gap-3 xl:grid-cols-3">
        {loading ? (
          <div className="soft-frame text-sm text-textMuted">Loading plans...</div>
        ) : (
          overview.plans.map((plan) => {
            const isCurrent = plan.id === currentPlan;
            return (
              <article
                key={plan.id}
                className={`soft-frame ${isCurrent ? "border-accent/60 bg-accent/10" : ""}`}
              >
                <p className="section-kicker">{plan.badge || "Plan"}</p>
                <h3 className="mt-1 text-base font-semibold">{plan.name}</h3>
                <p className="mt-1 text-sm text-textMuted">
                  {plan.priceMonthly === 0 ? "Free" : `$${plan.priceMonthly}/mo`} {plan.currency}
                </p>
                <ul className="mt-2 space-y-1 text-xs text-textMuted">
                  {(plan.features || []).slice(0, 5).map((feature) => (
                    <li key={feature}>• {feature}</li>
                  ))}
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button
                    type="button"
                    className="btn-primary !px-3 !py-1.5 text-xs"
                    disabled={Boolean(busyPlanId) || isCurrent}
                    onClick={() => handleStartCheckout(plan.id)}
                  >
                    {busyPlanId === plan.id ? "Preparing..." : isCurrent ? "Current plan" : "Choose plan"}
                  </button>
                  <button
                    type="button"
                    className="chip text-textMain transition hover:border-accent"
                    disabled={Boolean(busyPlanId)}
                    onClick={() => handleMockUpgrade(plan.id)}
                  >
                    Demo upgrade
                  </button>
                </div>
              </article>
            );
          })
        )}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          className="chip text-textMain transition hover:border-accent"
          onClick={handleOpenPortal}
          disabled={Boolean(busyPlanId)}
        >
          {busyPlanId === "portal" ? "Opening..." : "Open billing portal"}
        </button>
      </div>

      {message ? (
        <p className="mt-3 rounded-xl border border-accent/40 bg-accent/10 p-2 text-sm text-accent">{message}</p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-xl border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p>
      ) : null}
    </section>
  );
};

export default memo(BillingPanel);

