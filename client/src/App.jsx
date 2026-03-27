import { useCallback, useEffect, useMemo, useState } from "react";
import {
  AUTH_STORAGE_KEY,
  fetchAnalytics,
  fetchMe,
  fetchTrades,
  getOfflineQueue,
  isNetworkError,
  readOfflineSnapshot,
  saveOfflineSnapshot,
  syncOfflineQueue,
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
const PAGES = [
  { key: "dashboard", label: "Dashboard" },
  { key: "journal", label: "Journal" },
  { key: "analytics", label: "Analytics" },
  { key: "review", label: "Review" },
  { key: "settings", label: "Settings" },
];

const matchesTypedFilter = (value, filterValue) => {
  if (!filterValue) {
    return true;
  }
  return String(value || "")
    .toLowerCase()
    .includes(String(filterValue).toLowerCase());
};

const matchesTradeFilters = (trade, filters) => {
  if (!matchesTypedFilter(trade.pair, filters.pair)) {
    return false;
  }
  if (!matchesTypedFilter(trade.session, filters.session)) {
    return false;
  }
  if (!matchesTypedFilter(trade.setupType, filters.setupType)) {
    return false;
  }
  if (filters.cleanOnly && !trade.tags?.cleanSetup) {
    return false;
  }
  return true;
};

const formatSyncTime = (value) => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

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
  const [statusMessage, setStatusMessage] = useState("");
  const [showSettingsPanel, setShowSettingsPanel] = useState(true);
  const [settingsSavedAt, setSettingsSavedAt] = useState("");
  const [activePage, setActivePage] = useState("journal");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState([]);

  const refreshOfflineQueue = useCallback(() => {
    setOfflineQueue(getOfflineQueue());
  }, []);

  useEffect(() => {
    refreshOfflineQueue();
  }, [refreshOfflineQueue]);

  useEffect(() => {
    const updateOnlineStatus = () => setIsOnline(navigator.onLine);
    updateOnlineStatus();
    window.addEventListener("online", updateOnlineStatus);
    window.addEventListener("offline", updateOnlineStatus);
    return () => {
      window.removeEventListener("online", updateOnlineStatus);
      window.removeEventListener("offline", updateOnlineStatus);
    };
  }, []);

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
    setStatusMessage("");
    try {
      const [tradesResponse, analyticsResponse] = await Promise.all([
        fetchTrades({ ...filters, limit: 500 }, token),
        fetchAnalytics(filters, token),
      ]);

      const nextTrades = tradesResponse.data || [];
      const nextAnalytics = analyticsResponse || emptyAnalytics;

      setTrades(nextTrades);
      setAnalytics(nextAnalytics);
      saveOfflineSnapshot({
        trades: nextTrades,
        analytics: nextAnalytics,
        filters,
      });
    } catch (fetchError) {
      if (isNetworkError(fetchError)) {
        const snapshot = readOfflineSnapshot();
        if (snapshot?.trades || snapshot?.analytics) {
          setTrades(snapshot.trades || []);
          setAnalytics(snapshot.analytics || emptyAnalytics);
          const syncedAt = formatSyncTime(snapshot.updatedAt);
          setStatusMessage(
            syncedAt
              ? `Offline mode: showing last synced data from ${syncedAt}.`
              : "Offline mode: showing last synced data."
          );
        } else {
          setTrades([]);
          setAnalytics(emptyAnalytics);
          setStatusMessage("Offline mode: no synced data yet. New trades will queue locally.");
        }
      } else {
        setError(fetchError.message);
      }
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

  const onTradeSaved = (event = {}) => {
    if (event.mode === "offline") {
      refreshOfflineQueue();
      setStatusMessage("Trade saved offline and queued for auto-sync.");
      setError("");
      return;
    }

    setStatusMessage("");
    setError("");
    refreshOfflineQueue();
    loadData();
  };

  const syncQueuedData = useCallback(async () => {
    if (!token || !user || !isOnline) {
      return;
    }

    const hasPendingQueue = getOfflineQueue().length > 0;
    if (!hasPendingQueue) {
      refreshOfflineQueue();
      return;
    }

    const syncResult = await syncOfflineQueue(token);
    refreshOfflineQueue();

    if (syncResult.synced > 0) {
      await loadData();
      setStatusMessage(`Synced ${syncResult.synced} offline trade${syncResult.synced === 1 ? "" : "s"}.`);
    }

    if (syncResult.failed > 0) {
      const firstError = syncResult.errors?.[0]?.message || "Some offline trades could not sync.";
      setError(firstError);
    }
  }, [isOnline, loadData, refreshOfflineQueue, token, user]);

  useEffect(() => {
    syncQueuedData();
  }, [syncQueuedData]);

  const onAuthenticated = ({ token: nextToken, user: nextUser }) => {
    localStorage.setItem(AUTH_STORAGE_KEY, nextToken);
    setToken(nextToken);
    setUser(nextUser);
    setError("");
    setStatusMessage("");
    refreshOfflineQueue();
  };

  const onLogout = () => {
    localStorage.removeItem(AUTH_STORAGE_KEY);
    setToken("");
    setUser(null);
    setTrades([]);
    setOfflineQueue([]);
    setAnalytics(emptyAnalytics);
    setError("");
    setStatusMessage("");
  };

  const onSettingsSaved = () => {
    setShowSettingsPanel(false);
    setSettingsSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    setActivePage("journal");
  };

  const strategySignal = useMemo(() => {
    if (offlineQueue.length) {
      return `${offlineQueue.length} trade${offlineQueue.length === 1 ? "" : "s"} queued offline.`;
    }

    if (!analytics.overview.totalTrades) {
      return "No data yet. Log your first Asia High/Low reaction.";
    }

    const bestTag = analytics.tagAnalytics.bestConditions?.[0]?.label;
    if (bestTag) {
      return `Best edge so far: ${bestTag}`;
    }

    return "Keep tagging Acceptance vs Rejection to reveal your edge.";
  }, [analytics, offlineQueue.length]);

  const queuedTrades = useMemo(
    () =>
      offlineQueue
        .map((item) => item.displayTrade)
        .filter((trade) => matchesTradeFilters(trade, filters)),
    [filters, offlineQueue]
  );

  const mergedTrades = useMemo(() => [...queuedTrades, ...trades], [queuedTrades, trades]);

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
    <main className="app-shell mx-auto w-full max-w-[1600px] p-0 sm:p-3 md:p-5">
      <section className="journal-shell app-journal p-0 sm:p-4 md:p-6">
        <header className="journal-hero mb-4 md:mb-5">
          <div className="top-header">
            <div className="brand-block">
              <img src="/pwa-192x192.png" alt="Trading Journal logo" className="brand-logo" />
              <div>
                <p className="section-kicker">The Trading Journal</p>
                <h1 className="hero-title brand-title">Trading Journal</h1>
                <p className="hero-sub">Session-based forex tracking</p>
              </div>
            </div>

            <aside className="account-mini">
              <p className="text-sm font-semibold">{user.name}</p>
              <p className="text-xs text-textMuted">{user.email}</p>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="chip">{loading ? "Syncing..." : isOnline ? "Online" : "Offline"}</span>
                {offlineQueue.length ? (
                  <span className="chip">{offlineQueue.length} queued</span>
                ) : null}
                <button
                  type="button"
                  className="chip text-textMain transition hover:border-accent"
                  onClick={onLogout}
                >
                  Log out
                </button>
              </div>
            </aside>
          </div>
          <div className="strategy-badge mt-3 px-3 py-2 text-sm">{strategySignal}</div>
        </header>

        <section className="dashboard-frame">
          <div className="page-nav mb-4">
            <p className="section-kicker">Pages</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {PAGES.map((page) => (
                <button
                  key={page.key}
                  type="button"
                  className={`chip page-btn ${activePage === page.key ? "page-btn-active" : ""}`}
                  onClick={() => setActivePage(page.key)}
                >
                  {page.label}
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p className="mb-4 rounded-md border border-danger/40 bg-danger/10 p-3 text-sm text-danger">{error}</p>
          ) : null}
          {statusMessage ? (
            <p className="mb-4 rounded-md border border-border bg-panelMuted p-3 text-sm text-textMuted">
              {statusMessage}
            </p>
          ) : null}

          <div className="section-divider mb-4" />

          {activePage === "dashboard" ? (
            <section className="space-y-4">
              <div className="section-title">
                <h2>Filters & Session Activity</h2>
                <p>Preparation</p>
              </div>
              <div className="grid grid-cols-1 gap-4 xl:grid-cols-[1.05fr_0.95fr]">
                <FiltersBar filters={filters} onChange={onFilterChange} options={user.settings?.options} />
                <SessionPerformanceGraph
                  trades={mergedTrades}
                  sessionOptions={user.settings?.options?.sessions || []}
                />
              </div>
              <StatCards overview={analytics.overview} cleanOnlyPerformance={analytics.cleanOnlyPerformance} />
            </section>
          ) : null}

          {activePage === "journal" ? (
            <section className="space-y-4">
              <div className="section-title">
                <h2>Trade Entry</h2>
                <p>Execution</p>
              </div>
              <TradeEntryForm onTradeSaved={onTradeSaved} token={token} settings={user.settings} />
            </section>
          ) : null}

          {activePage === "analytics" ? (
            <section className="space-y-4">
              <div className="section-title">
                <h2>Analytics</h2>
                <p>Performance</p>
              </div>
              <StatCards overview={analytics.overview} cleanOnlyPerformance={analytics.cleanOnlyPerformance} />
              <BehaviorLab trades={mergedTrades} />
              <StreakTracker streaks={analytics.streaks} />
              <ProfitCurveChart points={analytics.profitCurve} />
              <DrawdownChart points={analytics.drawdownCurve} />
              <SetupBreakdown setupBreakdown={analytics.setupBreakdown} />
              <TagAnalytics
                tagAnalytics={analytics.tagAnalytics}
                cleanOnlyPerformance={analytics.cleanOnlyPerformance}
                conditionScores={analytics.conditionScores}
              />
            </section>
          ) : null}

          {activePage === "review" ? (
            <section className="space-y-4">
              <div className="section-title">
                <h2>Review & Boards</h2>
                <p>Reflection</p>
              </div>
              <HeatmapMatrix heatmap={analytics.heatmap} />
              <CoachingSummary coaching={analytics.coaching} />
              <TradesTable trades={mergedTrades} />
            </section>
          ) : null}

          {activePage === "settings" ? (
            <section className="space-y-4">
              <div className="section-title">
                <h2>Settings & Data Tools</h2>
                <p>Configuration</p>
              </div>
              {showSettingsPanel ? (
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
                  <SettingsPanel
                    user={user}
                    token={token}
                    onUserUpdate={setUser}
                    onSaved={onSettingsSaved}
                  />
                  <DataTools token={token} filters={filters} onImported={loadData} />
                </div>
              ) : (
                <div className="space-y-3">
                  <div className="soft-frame flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm text-textMuted">
                      Settings hidden
                      {settingsSavedAt ? ` after save at ${settingsSavedAt}.` : "."}
                    </p>
                    <button
                      type="button"
                      className="btn-primary"
                      onClick={() => setShowSettingsPanel(true)}
                    >
                      Change settings
                    </button>
                  </div>
                  <DataTools token={token} filters={filters} onImported={loadData} />
                </div>
              )}
            </section>
          ) : null}
        </section>
      </section>
    </main>
  );
};

export default App;
