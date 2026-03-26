import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchAnalytics, fetchTrades } from "./api/tradesApi";
import FiltersBar from "./components/FiltersBar";
import ProfitCurveChart from "./components/ProfitCurveChart";
import SessionPerformanceGraph from "./components/SessionPerformanceGraph";
import SetupBreakdown from "./components/SetupBreakdown";
import StatCards from "./components/StatCards";
import TagAnalytics from "./components/TagAnalytics";
import TradeEntryForm from "./components/TradeEntryForm";
import TradesTable from "./components/TradesTable";

const emptySummary = {
  totalTrades: 0,
  wins: 0,
  losses: 0,
  breakEven: 0,
  winRate: 0,
  averageRR: 0,
};

const emptyAnalytics = {
  overview: emptySummary,
  setupBreakdown: {
    continuation: emptySummary,
    reversal: emptySummary,
  },
  profitCurve: [],
  tagAnalytics: {
    items: [],
    bestConditions: [],
  },
  cleanOnlyPerformance: emptySummary,
};

const App = () => {
  const [filters, setFilters] = useState({
    pair: "",
    session: "",
    setupType: "",
    cleanOnly: false,
  });
  const [trades, setTrades] = useState([]);
  const [analytics, setAnalytics] = useState(emptyAnalytics);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const loadData = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const [tradesResponse, analyticsResponse] = await Promise.all([
        fetchTrades({ ...filters, limit: 300 }),
        fetchAnalytics(filters),
      ]);

      setTrades(tradesResponse.data || []);
      setAnalytics(analyticsResponse || emptyAnalytics);
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }, [filters]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const onFilterChange = (key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  };

  const onTradeSaved = () => {
    loadData();
  };

  const strategySignal = useMemo(() => {
    if (!analytics.overview.totalTrades) {
      return "No data yet. Log your first Asia High/Low reaction.";
    }

    const bestTag = analytics.tagAnalytics.bestConditions?.[0]?.label;
    if (bestTag) {
      return `Best edge so far: ${bestTag}`;
    }

    return "Keep tagging Acceptance vs Rejection to reveal your edge.";
  }, [analytics]);

  return (
    <main className="mx-auto w-full max-w-[1480px] p-2 sm:p-3 md:p-5">
      <section className="journal-shell p-4 md:p-6">
        <header className="journal-hero mb-4 md:mb-6">
          <h1 className="hero-title">The Trading Journal</h1>
          <p className="hero-meta">FAST JOURNALING | SESSION ANALYTICS | RULE-BASED EXECUTION</p>
        </header>

        <section className="dashboard-frame">
          <div className="mb-4 flex flex-col gap-3 md:mb-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="max-w-3xl text-sm text-textMuted">
                Rule-based logging for Asia High/Low reactions and clean execution.
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {loading ? <span className="chip">Syncing...</span> : <span className="chip">Ready</span>}
              </div>
            </div>

            <div className="flex flex-wrap gap-2 text-xs">
              <span className="chip">Trade only Asia High/Low reactions</span>
              <span className="chip">Track Acceptance vs Rejection</span>
              <span className="chip">Prioritize clean A+ setups</span>
            </div>

            <div className="strategy-badge px-3 py-2 text-sm">{strategySignal}</div>
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
            <FiltersBar filters={filters} onChange={onFilterChange} />
            <SessionPerformanceGraph trades={trades} />
          </div>

          {error ? (
            <p className="mb-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">
              {error}
            </p>
          ) : null}

          <div className="section-divider mb-4" />

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <TradeEntryForm onTradeSaved={onTradeSaved} />

            <div className="space-y-4">
              <StatCards overview={analytics.overview} cleanOnlyPerformance={analytics.cleanOnlyPerformance} />
              <ProfitCurveChart points={analytics.profitCurve} />
              <SetupBreakdown setupBreakdown={analytics.setupBreakdown} />
              <TagAnalytics
                tagAnalytics={analytics.tagAnalytics}
                cleanOnlyPerformance={analytics.cleanOnlyPerformance}
              />
            </div>
          </section>

          <section className="mt-4">
            <TradesTable trades={trades} />
          </section>
        </section>
      </section>
    </main>
  );
};

export default App;
