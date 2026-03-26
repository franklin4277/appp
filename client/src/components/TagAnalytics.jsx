const TagAnalytics = ({ tagAnalytics, cleanOnlyPerformance }) => {
  return (
    <section className="panel animate-riseIn">
      <h3 className="mb-3 text-sm font-semibold">Tag-Based Analytics</h3>

      <div className="mb-4 rounded-lg border border-border bg-panelMuted p-3">
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
                className="flex items-center justify-between rounded-md border border-border bg-panelMuted px-3 py-2 text-sm"
              >
                <span>{condition.label}</span>
                <span className="text-textMuted">
                  RR {condition.averageRR} | {condition.winRate}%
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
              className="flex items-center justify-between rounded-md border border-border bg-panelMuted px-3 py-2 text-sm"
            >
              <span>{item.label}</span>
              <span className="text-textMuted">
                {item.totalTrades} trades | RR {item.averageRR}
              </span>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
};

export default TagAnalytics;
