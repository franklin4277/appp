import { memo } from "react";

const StreakTracker = ({ streaks = {} }) => {
  const items = [
    { label: "Current Win Streak", value: streaks.currentWinStreak || 0 },
    { label: "Current Loss Streak", value: streaks.currentLossStreak || 0 },
    { label: "Best Win Streak", value: streaks.bestWinStreak || 0 },
    { label: "Worst Loss Streak", value: streaks.worstLossStreak || 0 },
    { label: "Best Rule Alignment Streak", value: streaks.bestRuleAlignmentStreak || 0 },
    { label: "Current Rule Alignment Streak", value: streaks.currentRuleAlignmentStreak || 0 },
  ];

  return (
    <section className="panel animate-riseIn">
      <h3 className="mb-3 text-sm font-semibold">Streak Tracker</h3>
      <div className="grid grid-cols-2 gap-2 md:grid-cols-3">
        {items.map((item) => (
          <article key={item.label} className="rounded-md border border-border bg-panelMuted px-3 py-2">
            <p className="text-xs text-textMuted">{item.label}</p>
            <p className="mt-1 text-lg font-semibold">{item.value}</p>
          </article>
        ))}
      </div>
    </section>
  );
};

export default memo(StreakTracker);
