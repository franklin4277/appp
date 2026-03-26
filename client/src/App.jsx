import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AUTH_STORAGE_KEY,
  fetchAnalytics,
  fetchMe,
  fetchTrades,
} from "./api/tradesApi";
import AuthPanel from "./components/AuthPanel";
import BehaviorLab from "./components/BehaviorLab";
import CoachingSummary from "./components/CoachingSummary";
import DataTools from "./components/DataTools";
import DrawdownChart from "./components/DrawdownChart";
import FiltersBar from "./components/FiltersBar";
import HeatmapMatrix from "./components/HeatmapMatrix";
import ProfitCurveChart from "./components/ProfitCurveChart";
import SessionPerformanceGraph from "./components/SessionPerformanceGraph";
import SettingsPanel from "./components/SettingsPanel";
import SetupBreakdown from "./components/SetupBreakdown";
import StatCards from "./components/StatCards";
import StreakTracker from "./components/StreakTracker";
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
  drawdownCurve: [],
  tagAnalytics: {
    items: [],
    bestConditions: [],
    worstConditions: [],
    confidenceRanked: [],
  },
  cleanOnlyPerformance: emptySummary,
  heatmap: {
    sessions: [],
    setupTypes: [],
    cells: [],
  },
  streaks: {},
  conditionScores: [],
  coaching: {
    daily: { strengths: [], mistakes: [] },
    weekly: { strengths: [], mistakes: [] },
  },
};

const readStoredToken = () => localStorage.getItem(AUTH_STORAGE_KEY) || "";

const App = () => {
  const [authLoading, setAuthLoading] = useState(true);
  const [token, setToken] = useState(() => readStoredToken());
  const [user, setUser] = useState(null);
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

  useEffect(() => {
    const loadSession = async () => {
      if (!token) {
        setAuthLoading(false);
        return;
      }

      try {
        const me = await fetchMe(token);
        setUser(me.user);
      } catch {
        localStorage.removeItem(AUTH_STORAGE_KEY);
        setToken("");
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    loadSession();
  }, [token]);

  const loadData = useCallback(async () => {
    if (!token || !user) {
      return;
    }

    setLoading(true);
    setError("");
    try {
      const [tradesResponse, analyticsResponse] = await Promise.all([
        fetchTrades({ ...filters, limit: 500 }, token),
        fetchAnalytics(filters, token),
      ]);

      setTrades(tradesResponse.data || []);
      setAnalytics(analyticsResponse || emptyAnalytics);
    } catch (fetchError) {
      setError(fetchError.message);
    } finally {
      setLoading(false);
    }
  }, [filters, token, user]);

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

  const onAuthenticated = ({ token: nextToken, user: nextUser }) => {
    localStorage.setItem(AUTH_STORAGE_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
  };

  const onLogout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setToken("");
    setUser(null);
    setTrades([]);
    setAnalytics(emptyAnalytics);
    setError("");
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

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[560px] items-center justify-center p-4">
        <section className="panel text-sm text-textMuted">Loading session...</section>
      </main>
    );
  }

  if (!token || !user) {
    return <AuthPanel onAuthenticated={onAuthenticated} />;
  }

  return (
    <main className="mx-auto w-full max-w-[1600px] p-2 sm:p-3 md:p-5">
      <section className="journal-shell p-4 md:p-6">
        <header className="journal-hero mb-4 md:mb-6">
          <h1 className="hero-title">The Trading Journal</h1>
          <p className="hero-meta">ACCOUNT MODE | PRIVATE JOURNAL | RULE-BASED EXECUTION</p>
          <div className="mt-2 flex flex-wrap items-center justify-center gap-2 text-xs">
            <span className="chip">{user.name}</span>
            <span className="chip">{user.email}</span>
            <button type="button" className="chip text-textMain transition hover:border-accent" onClick={onLogout}>
              Log out
            </button>
          </div>
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
            <FiltersBar filters={filters} onChange={onFilterChange} options={user.settings?.options} />
            <SessionPerformanceGraph
              trades={trades}
              sessionOptions={user.settings?.options?.sessions || []}
            />
          </div>

          <div className="mb-4 grid grid-cols-1 gap-4 xl:grid-cols-2">
            <SettingsPanel user={user} token={token} onUserUpdate={setUser} />
            <DataTools token={token} filters={filters} onImported={loadData} />
          </div>

          {error ? (
            <p className="mb-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>
          ) : null}

          <div className="section-divider mb-4" />

          <section className="grid grid-cols-1 gap-4 xl:grid-cols-[1.1fr_0.9fr]">
            <TradeEntryForm onTradeSaved={onTradeSaved} token={token} settings={user.settings} />

            <div className="space-y-4">
              <StatCards overview={analytics.overview} cleanOnlyPerformance={analytics.cleanOnlyPerformance} />
              <BehaviorLab trades={trades} />
              <StreakTracker streaks={analytics.streaks} />
              <ProfitCurveChart points={analytics.profitCurve} />
              <DrawdownChart points={analytics.drawdownCurve} />
              <SetupBreakdown setupBreakdown={analytics.setupBreakdown} />
              <TagAnalytics
                tagAnalytics={analytics.tagAnalytics}
                cleanOnlyPerformance={analytics.cleanOnlyPerformance}
                conditionScores={analytics.conditionScores}
              />
            </div>
          </section>

          <section className="mt-4 grid grid-cols-1 gap-4">
            <HeatmapMatrix heatmap={analytics.heatmap} />
            <CoachingSummary coaching={analytics.coaching} />
            <TradesTable trades={trades} />
          </section>
        </section>
      </section>
    </main>
  );
};

export default App;

