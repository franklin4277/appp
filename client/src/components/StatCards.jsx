import { memo } from "react";
import { buildEdgeInsights } from "../utils/insights";

const StatCards = ({ overview, cleanOnlyPerformance, trades = [], analytics = {}, riskControls = {} }) => {
  const edge = buildEdgeInsights({
    trades,
    analytics,
    riskControls,
  });

  const cards = [
    {
      label: "Total Trades",
      value: overview.totalTrades,
      hint: "All filtered trades",
      meter: Math.min(100, Number(overview.totalTrades || 0) * 2.5),
    },
    {
      label: "Win Rate",
      value: `${overview.winRate}%`,
      hint: "Win percentage",
      meter: Math.min(100, Number(overview.winRate || 0)),
    },
    {
      label: "Average RR",
      value: overview.averageRR,
      hint: "Risk-reward outcome",
      meter: Math.max(0, Math.min(100, Number(overview.averageRR || 0) * 35 + 50)),
    },
    {
      label: "Expectancy",
      value: `${edge.expectancy} RR`,
      hint: "Expected RR per trade",
      meter: Math.max(0, Math.min(100, Number(edge.expectancy || 0) * 45 + 50)),
    },
    {
      label: "Max Drawdown",
      value: `${edge.maxDrawdown} RR`,
      hint: "Largest equity pullback",
      meter: Math.max(0, Math.min(100, 100 - Math.abs(Number(edge.maxDrawdown || 0) * 12))),
    },
    {
      label: "Equity Curve",
      value: `${edge.equityNow} RR`,
      hint: "Current cumulative RR",
      meter: Math.max(0, Math.min(100, Number(edge.equityNow || 0) * 8 + 50)),
    },
    {
      label: "A+ Win Rate",
      value: `${cleanOnlyPerformance.winRate || 0}%`,
      hint: "Clean setups only",
      meter: Math.min(100, Number(cleanOnlyPerformance.winRate || 0)),
    },
    {
      label: "Best Setup",
      value: edge.bestSetup?.key || "Need data",
      hint: edge.bestSetup ? `${edge.bestSetup.winRate}% win rate` : "Requires setup sample",
      meter: edge.bestSetup ? Math.min(100, Number(edge.bestSetup.winRate || 0)) : 20,
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      {cards.map((card, index) => (
        <article
          key={card.label}
          className="panel metric-card animate-riseIn"
          style={{ animationDelay: `${index * 35}ms` }}
        >
          <p className="text-[11px] uppercase tracking-[0.12em] text-textMuted">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold tracking-tight text-textMain">{card.value}</p>
          <div className="metric-track" role="presentation" aria-hidden="true">
            <div className="metric-fill" style={{ width: `${Math.round(card.meter)}%` }} />
          </div>
          <p className="metric-footnote">{card.hint}</p>
        </article>
      ))}
    </section>
  );
};

export default memo(StatCards);
