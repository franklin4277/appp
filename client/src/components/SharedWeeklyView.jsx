import { useEffect, useState } from "react";
import { fetchSharedWeeklyReview } from "../api/tradesApi";

const SharedWeeklyView = ({ shareToken }) => {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [report, setReport] = useState(null);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      setError("");
      try {
        const payload = await fetchSharedWeeklyReview(shareToken);
        setReport(payload);
      } catch (loadError) {
        setError(loadError.message || "Could not load shared report.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, [shareToken]);

  return (
    <main className="app-shell mx-auto flex min-h-screen w-full max-w-3xl items-center justify-center p-0 sm:p-4">
      <section className="journal-shell app-journal w-full max-w-2xl p-0 sm:p-4 md:p-6">
        <section className="panel animate-riseIn">
          <div className="brand-block">
            <img src="/pwa-192x192.png" alt="Trading Journal logo" className="brand-logo" />
            <div>
              <p className="section-kicker">Shared Weekly Report</p>
              <h1 className="hero-title brand-title mt-1">The Trading Journal</h1>
            </div>
          </div>

          {loading ? <p className="mt-3 text-sm text-textMuted">Loading report...</p> : null}
          {error ? (
            <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p>
          ) : null}

          {report ? (
            <div className="mt-3 rounded-md border border-border bg-panelMuted p-3 text-sm text-textMuted">
              <p className="text-textMain">
                {report.title || "Weekly report"} | {report.periodStart} to {report.periodEnd}
              </p>
              <p className="mt-2">
                Trades: {report.summary?.totalTrades || 0} | Win rate: {report.summary?.winRate || 0}% | Net RR:{" "}
                {report.summary?.netRR || 0}
              </p>
              <p className="mt-1">Average RR: {report.summary?.averageRR || 0}</p>
              <p className="mt-1">Best setup: {report.summary?.bestSetup?.label || "N/A"}</p>
              <p className="mt-1">Biggest mistake: {report.summary?.biggestMistake?.label || "N/A"}</p>
              <p className="mt-1">Emotion pattern: {report.summary?.emotionPattern?.label || "N/A"}</p>

              <div className="mt-2">
                <p className="text-textMain">Action plan</p>
                <ul className="mt-1 list-disc space-y-1 pl-4">
                  {(report.summary?.actionPlan || []).map((item, index) => (
                    <li key={`${item}-${index}`}>{item}</li>
                  ))}
                </ul>
              </div>

              <p className="mt-2 text-xs">Link expires: {report.expiresAt?.slice(0, 10) || "n/a"}</p>
              <a href="/" className="chip mt-2 inline-flex text-textMain transition hover:border-accent">
                Open full app
              </a>
            </div>
          ) : null}
        </section>
      </section>
    </main>
  );
};

export default SharedWeeklyView;
