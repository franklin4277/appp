const SESSIONS = ["Asia", "London", "New York"];

const summarizeSessions = (trades = []) => {
  const bySession = SESSIONS.reduce((acc, session) => {
    acc[session] = {
      total: 0,
      wins: 0,
      totalRR: 0,
      winRate: 0,
      avgRR: 0,
    };
    return acc;
  }, {});

  trades.forEach((trade) => {
    const bucket = bySession[trade.session];
    if (!bucket) {
      return;
    }

    bucket.total += 1;
    bucket.totalRR += Number(trade.rrAchieved || 0);
    if (trade.result === "Win") {
      bucket.wins += 1;
    }
  });

  SESSIONS.forEach((session) => {
    const bucket = bySession[session];
    bucket.winRate = bucket.total ? Math.round((bucket.wins / bucket.total) * 100) : 0;
    bucket.avgRR = bucket.total ? Math.round((bucket.totalRR / bucket.total) * 100) / 100 : 0;
  });

  return bySession;
};

const SessionPerformanceGraph = ({ trades }) => {
  const sessions = summarizeSessions(trades);
  const maxTotal = Math.max(...SESSIONS.map((session) => sessions[session].total), 1);
  const chartHeight = 120;
  const baseY = 132;

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Session Activity</h3>
        <span className="chip">{trades.length} trades</span>
      </div>

      <svg className="h-40 w-full" viewBox="0 0 420 160" preserveAspectRatio="none">
        <line x1="30" y1={baseY} x2="392" y2={baseY} stroke="#25344f" strokeWidth="1" />
        {SESSIONS.map((session, index) => {
          const barWidth = 68;
          const gap = 52;
          const x = 44 + index * (barWidth + gap);
          const sessionData = sessions[session];
          const barHeight = Math.round((sessionData.total / maxTotal) * chartHeight);
          const y = baseY - barHeight;

          return (
            <g key={session}>
              <rect x={x} y={y} width={barWidth} height={barHeight} rx="8" fill="#314667" />
              <rect x={x} y={y} width={barWidth} height="6" rx="6" fill="#415777" />
              <text x={x + barWidth / 2} y="150" textAnchor="middle" fill="#9fb0ca" fontSize="11">
                {session}
              </text>
              <text x={x + barWidth / 2} y={y - 8} textAnchor="middle" fill="#e5ecf6" fontSize="11">
                {sessionData.total}
              </text>
            </g>
          );
        })}
      </svg>

      <div className="grid grid-cols-1 gap-2 md:grid-cols-3">
        {SESSIONS.map((session) => (
          <div key={session} className="rounded-md border border-border bg-panelMuted px-3 py-2 text-xs">
            <p className="text-textMuted">{session}</p>
            <p className="mt-1 text-textMain">
              Win {sessions[session].winRate}% | Avg RR {sessions[session].avgRR}
            </p>
          </div>
        ))}
      </div>
    </section>
  );
};

export default SessionPerformanceGraph;
