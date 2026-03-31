import { memo, useMemo } from "react";
import { buildMonthlyBreakdown } from "../utils/insights";

const MonthlyPerformancePanel = ({ trades = [] }) => {
  const rows = useMemo(() => buildMonthlyBreakdown(trades, 6), [trades]);

  return (
    <section className="panel animate-riseIn">
      <div className="section-title">
        <h2>Monthly Breakdown</h2>
        <p>Review</p>
      </div>

      {rows.length ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
          {rows.map((row) => (
            <article key={row.key} className="soft-frame">
              <p className="text-xs uppercase tracking-wide text-textMuted">{row.month}</p>
              <p className="mt-1 text-sm text-textMain">
                {row.totalTrades} trades | {row.winRate}% win
              </p>
              <p className="text-sm text-textMain">Avg RR {row.averageRR} | Net {row.netRR} RR</p>
              <p className="mt-1 text-xs text-textMuted">Best setup: {row.bestSetup}</p>
            </article>
          ))}
        </div>
      ) : (
        <p className="text-sm text-textMuted">No monthly data yet. Add trades to unlock monthly reviews.</p>
      )}
    </section>
  );
};

export default memo(MonthlyPerformancePanel);

