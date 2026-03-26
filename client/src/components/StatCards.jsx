const StatCards = ({ overview, cleanOnlyPerformance }) => {
  const cards = [
    { label: "Total Trades", value: overview.totalTrades },
    { label: "Win Rate", value: `${overview.winRate}%` },
    { label: "Average RR", value: overview.averageRR },
    {
      label: "A+ Win Rate",
      value: `${cleanOnlyPerformance.winRate || 0}%`,
    },
  ];

  return (
    <section className="grid grid-cols-2 gap-3 lg:grid-cols-4">
      {cards.map((card, index) => (
        <article
          key={card.label}
          className="panel animate-riseIn"
          style={{ animationDelay: `${index * 35}ms` }}
        >
          <p className="text-xs uppercase tracking-wide text-textMuted">{card.label}</p>
          <p className="mt-2 text-2xl font-semibold">{card.value}</p>
        </article>
      ))}
    </section>
  );
};

export default StatCards;
