import { memo } from "react";

const TagAnalytics = ({ tagAnalytics, cleanOnlyPerformance, conditionScores = [] }) => {
  return (
    <section className="panel animate-riseIn">
      <h3 className="mb-3 text-sm font-semibold">Tag-Based Analytics</h3>

      <div className="mb-4 rounded-xl border border-border bg-panelMuted p-3">
        <p className="text-xs uppercase tracking-wide text-textMuted">A+ Setup Performance</p>
        <p className="mt-1 text-lg font-semibold">{cleanOnlyPerformance.winRate}% win rate</p>
        <p className="text-sm text-textMuted">
          {cleanOnlyPerformance.totalTrades} clean trades | Avg RR {cleanOnlyPerformance.averageRR}
        </p>
      </div>

      <div className="mb-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-textMuted">Best Conditions</p>
        {tagAnalytics.bestConditions?.length ? (
          <div className="space-y-2">
            {tagAnalytics.bestConditions.map((condition) => (
              <div
                key={condition.key}
                className="flex items-center justify-between rounded-xl border border-border bg-panelMuted px-3 py-2 text-sm"
              >
                <span>{condition.label}</span>
                <span className="text-textMuted">
                  RR {condition.averageRR} | {condition.winRate}% | C {condition.confidence || 0}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-textMuted">Need at least 3 tagged trades to rank conditions.</p>
        )}
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-textMuted">All Tags</p>
        <div className="max-h-56 space-y-2 overflow-auto pr-1">
          {tagAnalytics.items?.map((item) => (
            <div
              key={item.key}
              className="flex items-center justify-between rounded-xl border border-border bg-panelMuted px-3 py-2 text-sm"
            >
              <span>{item.label}</span>
              <span className="text-textMuted">
                {item.totalTrades} trades | RR {item.averageRR} | C {item.confidence || 0}
              </span>
            </div>
          ))}
        </div>
      </div>

      <div className="mt-3">
        <p className="mb-2 text-xs uppercase tracking-wide text-textMuted">Confidence Ranked Conditions</p>
        {conditionScores.length ? (
          <div className="space-y-2">
            {conditionScores.slice(0, 6).map((item) => (
              <div
                key={item.key}
                className="flex items-center justify-between rounded-xl border border-border bg-panelMuted px-3 py-2 text-sm"
              >
                <span>{item.label}</span>
                <span className="text-textMuted">
                  Score {item.score} | C {item.confidence}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <p className="text-sm text-textMuted">More trades are needed to rank conditions confidently.</p>
        )}
      </div>
    </section>
  );
};

export default memo(TagAnalytics);
