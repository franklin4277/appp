import { memo, useMemo } from "react";
import { buildEdgeInsights } from "../utils/insights";

const InsightChip = ({ label, value, tone = "neutral" }) => (
  <article
    className={`soft-frame ${
      tone === "positive" ? "border-emerald-300/35" : tone === "warn" ? "border-amber-300/35" : ""
    }`}
  >
    <p className="text-[11px] uppercase tracking-[0.11em] text-textMuted">{label}</p>
    <p className="mt-1 text-sm font-semibold text-textMain">{value}</p>
  </article>
);

const EdgeInsightsPanel = ({ trades = [], analytics = {}, riskControls = {} }) => {
  const insights = useMemo(
    () =>
      buildEdgeInsights({
        trades,
        analytics,
        riskControls,
      }),
    [analytics, riskControls, trades]
  );

  return (
    <section className="panel animate-riseIn">
      <div className="section-title">
        <h2>Edge Detection</h2>
        <p>Actionable insights</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        <InsightChip label="Expectancy" value={`${insights.expectancy} RR/trade`} tone={insights.expectancy >= 0 ? "positive" : "warn"} />
        <InsightChip label="Equity Curve" value={`${insights.equityNow} RR`} tone={insights.equityNow >= 0 ? "positive" : "warn"} />
        <InsightChip label="Max Drawdown" value={`${insights.maxDrawdown} RR`} tone={insights.maxDrawdown < 0 ? "warn" : "neutral"} />
        <InsightChip
          label="Best Condition"
          value={
            insights.bestCondition
              ? `${insights.bestCondition.label} (${insights.bestCondition.winRate}% win)`
              : "Need more data"
          }
          tone="positive"
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 md:grid-cols-2">
        <article className="soft-frame">
          <p className="text-xs uppercase tracking-wide text-textMuted">Best Performing Setup</p>
          <p className="mt-1 text-sm text-textMain">
            {insights.bestSetup
              ? `${insights.bestSetup.key} | ${insights.bestSetup.winRate}% win | RR ${insights.bestSetup.averageRR}`
              : "Need at least 3 trades per setup"}
          </p>
        </article>
        <article className="soft-frame">
          <p className="text-xs uppercase tracking-wide text-textMuted">Best Session</p>
          <p className="mt-1 text-sm text-textMain">
            {insights.bestSession
              ? `${insights.bestSession.key} session has ${insights.bestSession.winRate}% win rate`
              : "Need at least 3 trades per session"}
          </p>
        </article>
      </div>

      <div className="mt-3 rounded-xl border border-border bg-panelMuted p-3">
        <p className="text-xs uppercase tracking-wide text-textMuted">Worst Habit Detected</p>
        <p className="mt-1 text-sm font-medium text-textMain">{insights.worstHabit?.title || "No major leak yet"}</p>
        <p className="mt-1 text-xs text-textMuted">{insights.worstHabit?.detail || "Keep logging to improve signal strength."}</p>
      </div>

      <div className="mt-3">
        <p className="text-xs uppercase tracking-wide text-textMuted">Insight Notifications</p>
        {insights.notifications.length ? (
          <div className="mt-2 space-y-2">
            {insights.notifications.map((item) => (
              <div
                key={item.id}
                className={`rounded-xl border p-2 text-sm ${
                  item.level === "warn"
                    ? "border-amber-400/30 bg-amber-500/10 text-amber-200"
                    : "border-border bg-panelMuted text-textMain"
                }`}
              >
                {item.message}
              </div>
            ))}
          </div>
        ) : (
          <p className="mt-1 text-sm text-textMuted">No active alerts. Keep executing your plan.</p>
        )}
      </div>
    </section>
  );
};

export default memo(EdgeInsightsPanel);

