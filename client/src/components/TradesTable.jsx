const resultStyles = {
  Win: "text-accent",
  Loss: "text-danger",
  BE: "text-textMuted",
};

const formatDate = (value) =>
  new Date(value).toLocaleString([], {
    year: "numeric",
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });

const TradesTable = ({ trades }) => {
  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recent Trades</h3>
        <span className="chip">{trades.length} shown</span>
      </div>

      <div className="overflow-auto">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead>
            <tr className="border-b border-border text-left text-textMuted">
              <th className="pb-2 pr-2 font-medium">Time</th>
              <th className="pb-2 pr-2 font-medium">Pair</th>
              <th className="pb-2 pr-2 font-medium">Session</th>
              <th className="pb-2 pr-2 font-medium">Setup</th>
              <th className="pb-2 pr-2 font-medium">Result</th>
              <th className="pb-2 pr-2 font-medium">RR</th>
              <th className="pb-2 pr-2 font-medium">Tags</th>
            </tr>
          </thead>
          <tbody>
            {trades.map((trade) => (
              <tr key={trade._id} className="border-b border-border/60">
                <td className="py-2 pr-2 text-textMuted">{formatDate(trade.tradeDate)}</td>
                <td className="py-2 pr-2">{trade.pair}</td>
                <td className="py-2 pr-2">{trade.session}</td>
                <td className="py-2 pr-2">{trade.setupType === "Asia Break -> Continuation" ? "Cont." : "Rev."}</td>
                <td className={`py-2 pr-2 font-semibold ${resultStyles[trade.result]}`}>{trade.result}</td>
                <td className="py-2 pr-2">{trade.rrAchieved}</td>
                <td className="py-2 pr-2 text-xs text-textMuted">
                  {trade.tags.cleanSetup ? "A+ " : ""}
                  {trade.tags.pocOutcome || "No POC"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default TradesTable;
