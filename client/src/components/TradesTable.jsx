import { memo, useEffect, useMemo, useState } from "react";

const MOBILE_BATCH_SIZE = 60;
const DESKTOP_BATCH_SIZE = 140;
const dateFormatter = new Intl.DateTimeFormat(undefined, {
  year: "numeric",
  month: "short",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
});

const resultStyles = {
  Win: "border border-accent/50 bg-accent/15 text-textMain",
  Loss: "border border-danger/50 bg-danger/15 text-danger",
  BE: "border border-border bg-panel text-textMuted",
};

const formatDate = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Unknown time";
  }
  return dateFormatter.format(date);
};

const TradesTable = ({ trades }) => {
  const [mobileVisibleCount, setMobileVisibleCount] = useState(MOBILE_BATCH_SIZE);
  const [desktopVisibleCount, setDesktopVisibleCount] = useState(DESKTOP_BATCH_SIZE);

  useEffect(() => {
    setMobileVisibleCount(MOBILE_BATCH_SIZE);
    setDesktopVisibleCount(DESKTOP_BATCH_SIZE);
  }, [trades.length]);

  const mobileTrades = useMemo(
    () => trades.slice(0, Math.max(MOBILE_BATCH_SIZE, mobileVisibleCount)),
    [mobileVisibleCount, trades]
  );

  const mobileDisplayTrades = useMemo(
    () =>
      mobileTrades.map((trade) => ({
        ...trade,
        _displayDate: formatDate(trade.tradeDate),
      })),
    [mobileTrades]
  );

  const desktopTrades = useMemo(
    () => trades.slice(0, Math.max(DESKTOP_BATCH_SIZE, desktopVisibleCount)),
    [desktopVisibleCount, trades]
  );
  const desktopDisplayTrades = useMemo(
    () =>
      desktopTrades.map((trade) => ({
        ...trade,
        _displayDate: formatDate(trade.tradeDate),
      })),
    [desktopTrades]
  );
  const hasMoreMobileTrades = trades.length > mobileTrades.length;
  const hasMoreDesktopTrades = trades.length > desktopTrades.length;

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Recent Trades</h3>
        <span className="chip">{trades.length} loaded</span>
      </div>

      <div className="space-y-3 md:hidden">
        {mobileDisplayTrades.length ? (
          mobileDisplayTrades.map((trade) => (
            <article key={trade._id} className="mobile-card">
              <div className="mb-1 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-semibold">{trade.pair}</p>
                  {trade.isOfflinePending ? <span className="chip">Queued</span> : null}
                </div>
                <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${resultStyles[trade.result]}`}>
                  {trade.result}
                </span>
              </div>
              <p className="text-xs text-textMuted">{trade._displayDate}</p>
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

      <div className="table-shell hidden overflow-auto md:block">
        <table className="w-full min-w-[760px] border-collapse text-sm">
          <thead className="table-head sticky top-0 z-[1]">
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
              desktopDisplayTrades.map((trade) => (
                <tr key={trade._id} className="table-row border-b border-border/60">
                  <td className="py-2 pr-2 text-textMuted">{trade._displayDate}</td>
                  <td className="py-2 pr-2">{trade.pair}</td>
                  <td className="py-2 pr-2">{trade.session}</td>
                  <td className="py-2 pr-2">
                    {trade.setupType === "Asia Break -> Continuation" ? "Cont." : "Rev."}
                  </td>
                  <td className="py-2 pr-2">
                    <span className={`rounded-full px-2 py-0.5 text-xs font-semibold ${resultStyles[trade.result]}`}>
                      {trade.result}
                    </span>
                  </td>
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
      {hasMoreDesktopTrades ? (
        <button
          type="button"
          className="btn-primary mt-3 hidden w-full md:block"
          onClick={() => setDesktopVisibleCount((prev) => prev + DESKTOP_BATCH_SIZE)}
        >
          Load more trades
        </button>
      ) : null}
    </section>
  );
};

export default memo(TradesTable);
