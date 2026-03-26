const SetupBreakdown = ({ setupBreakdown }) => {
  const rows = [
    {
      title: "Continuation",
      data: setupBreakdown.continuation,
    },
    {
      title: "Reversal",
      data: setupBreakdown.reversal,
    },
  ];

  return (
    <section className="panel animate-riseIn">
      <h3 className="mb-3 text-sm font-semibold">Setup Breakdown</h3>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {rows.map((row) => (
          <article key={row.title} className="rounded-lg border border-border bg-panelMuted p-3">
            <p className="text-xs uppercase tracking-wide text-textMuted">{row.title}</p>
            <p className="mt-1 text-xl font-semibold">{row.data.winRate}% win</p>
            <p className="text-sm text-textMuted">
              {row.data.totalTrades} trades | Avg RR {row.data.averageRR}
            </p>
          </article>
        ))}
      </div>
    </section>
  );
};

export default SetupBreakdown;
