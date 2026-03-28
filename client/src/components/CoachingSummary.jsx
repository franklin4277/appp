import { memo } from "react";
import SectionEmptyState from "./SectionEmptyState";

const SummaryCard = ({ title, block, caption }) => (
  <article className="rounded-xl border border-border bg-panelMuted p-3">
    <p className="text-xs uppercase tracking-wide text-textMuted">{title}</p>
    <p className="mt-1 text-sm text-textMuted">{caption}</p>
    <p className="mt-2 text-sm text-textMain">
      {block.totalTrades} trades | Win {block.winRate}% | RR {block.averageRR}
    </p>
    <p className="text-sm text-textMain">Net RR {block.netRR}</p>

    <div className="mt-2">
      <p className="text-xs uppercase tracking-wide text-textMuted">Top Strengths</p>
      {block.strengths?.length ? (
        <ul className="mt-1 list-disc pl-4 text-xs text-textMain">
          {block.strengths.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-textMuted">No clear edge yet.</p>
      )}
    </div>

    <div className="mt-2">
      <p className="text-xs uppercase tracking-wide text-textMuted">Top Mistakes</p>
      {block.mistakes?.length ? (
        <ul className="mt-1 list-disc pl-4 text-xs text-textMain">
          {block.mistakes.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : (
        <p className="mt-1 text-xs text-textMuted">No recurring mistakes flagged.</p>
      )}
    </div>

    <p className="mt-2 rounded-xl border border-border bg-panel px-2 py-1 text-xs text-textMain">{block.focus}</p>
  </article>
);

const CoachingSummary = ({ coaching }) => {
  if (!coaching?.daily && !coaching?.weekly) {
    return <SectionEmptyState title="Coaching Summary" message="Need trade data to generate coaching summary." />;
  }

  return (
    <section className="panel animate-riseIn">
      <h3 className="mb-3 text-sm font-semibold">Daily & Weekly Coaching</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SummaryCard
          title="Daily"
          caption={coaching.daily?.date ? `Date ${coaching.daily.date}` : "Current day"}
          block={coaching.daily || { strengths: [], mistakes: [] }}
        />
        <SummaryCard
          title="Weekly"
          caption={
            coaching.weekly?.periodStart
              ? `${coaching.weekly.periodStart} to ${coaching.weekly.periodEnd}`
              : "Last 7 days"
          }
          block={coaching.weekly || { strengths: [], mistakes: [] }}
        />
      </div>
    </section>
  );
};

export default memo(CoachingSummary);
