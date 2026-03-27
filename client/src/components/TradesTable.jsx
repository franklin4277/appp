import { useEffect, useMemo, useState } from "react";

const MOBILE_BATCH_SIZE = 60;

const resultStyles = {
  Win: "text-accent",
  Loss: "text-danger",
  BE: "text-textMuted",
};

const formatDate = (value) =>
  (() => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) {
      return "Unknown time";
    }
    return date.toLocaleString([], {
      year: "numeric",
      month: "short",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  })();

const TradesTable = ({ trades }) => {
  const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_BATCH_SIZE);

  useEffect(() => {
    setMobileVisibleCount(MOBILE_BATCH_SIZE);
  }, [trades.length]);

  const mobileTrades = useMemo(
    () => trades.slice(0, Math.max(MOBILE_BATCH_SIZE, mobileVisibleCount)),
    [mobileVisibleCount, trades]
  );
  const hasMoreMobileTrades = trades.length > mobileTrades.length;

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recent Trades</h3>
        <span className="chip">{trades.length} shown</span>
      </div>

      <div className="space-y-3 md:hidden">
        {mobileTrades.length ? (
          mobileTrades.map((trade) => (
            <article key={trade._id} className="mobile-card">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{trade.pair}</p>
                  {trade.isOfflinePending ? <span className="chip">Queued</span> : null}
                </div>
                <p className={`text-sm font-semibold ${resultStyles[trade.result]}`}>{trade.result}</p>
              </div>
              <p className="text-xs text-textMuted">{formatDate(trade.tradeDate)}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs text-textMuted">
                <span className="chip">{trade.session}</span>
                <span className="chip">
                  {trade.setupType === "Asia Break -> Continuation" ? "Continuation" : "Reversal"}
                </span>
                <span className="chip">RR {trade.rrAchieved}</span>
                <span className="chip">{trade.tags?.pocOutcome || "No POC"}</span>
                {trade.ruleBreakReason ? <span className="chip">Rule break</span> : null}
              </div>
              {trade.ruleBreakReason ? (
                <p className="mt-2 text-xs text-textMuted">Reason: {trade.ruleBreakReason}</p>
              ) : null}
            </article>
          ))
        ) : (
          <div className="mobile-card text-sm text-textMuted">No trades yet for current filters.</div>
        )}
        {hasMoreMobileTrades ? (
          <button
            type="button"
            className="btn-primary w-full"
            onClick={() => setMobileVisibleCount((prev) => prev + MOBILE_BATCH_SIZE)}
          >
            Load more trades
          </button>
        ) : null}
      </div>

      <div className="hidden overflow-auto md:block">
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
              <th className="pb-2 pr-2 font-medium">Notes</th>
            </tr>
          </thead>
          <tbody>
            {trades.length ? (
              trades.map((trade) => (
                <tr key={trade._id} className="border-b border-border/60">
                  <td className="py-2 pr-2 text-textMuted">{formatDate(trade.tradeDate)}</td>
                  <td className="py-2 pr-2">{trade.pair}</td>
                  <td className="py-2 pr-2">{trade.session}</td>
                  <td className="py-2 pr-2">
                    {trade.setupType === "Asia Break -> Continuation" ? "Cont." : "Rev."}
                  </td>
                  <td className={`py-2 pr-2 font-semibold ${resultStyles[trade.result]}`}>{trade.result}</td>
                  <td className="py-2 pr-2">{trade.rrAchieved}</td>
                  <td className="py-2 pr-2 text-xs text-textMuted">
                    {trade.isOfflinePending ? "Queued | " : ""}
                    {trade.tags?.cleanSetup ? "A+ " : ""}
                    {trade.tags?.pocOutcome || "No POC"}
                  </td>
                  <td className="py-2 pr-2 text-xs text-textMuted">
                    {trade.ruleBreakReason ? `Rule break: ${trade.ruleBreakReason}` : "-"}
                  </td>
                </tr>
              ))
            ) : (
              <tr>
                <td className="py-4 text-textMuted" colSpan={8}>
                  No trades yet for current filters.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </section>
  );
};

export default TradesTable;
