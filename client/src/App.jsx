import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearAuthSession,
  clearOfflineQueue,
  createProfile,
  fetchAnalytics,
  fetchMe,
  fetchTrades,
  getOfflineQueue,
  isNetworkError,
  logoutSession,
  persistAuthSession,
  readOfflineSnapshot,
  readStoredAuthSession,
  saveOfflineSnapshot,
  setActiveProfile,
  syncOfflineQueue,
} from "./api/tradesApi";
import AuthPanel from "./components/AuthPanel";
import AccountSecurityPanel from "./components/AccountSecurityPanel";
import BehaviorLab from "./components/BehaviorLab";
import CalendarConsistency from "./components/CalendarConsistency";
import CoachingSummary from "./components/CoachingSummary";
import DataTools from "./components/DataTools";
import DrawdownChart from "./components/DrawdownChart";
import FiltersBar from "./components/FiltersBar";
import HeatmapMatrix from "./components/HeatmapMatrix";
import ProfitCurveChart from "./components/ProfitCurveChart";
import ScreenshotReplay from "./components/ScreenshotReplay";
import SessionPerformanceGraph from "./components/SessionPerformanceGraph";
import SettingsPanel from "./components/SettingsPanel";
import SharedWeeklyView from "./components/SharedWeeklyView";
import SetupBreakdown from "./components/SetupBreakdown";
import StatCards from "./components/StatCards";
import StreakTracker from "./components/StreakTracker";
import TagAnalytics from "./components/TagAnalytics";
import TradeEntryForm from "./components/TradeEntryForm";
import TradesTable from "./components/TradesTable";
import WeeklyReviewReport from "./components/WeeklyReviewReport";
import { buildLocalDashboardAnalytics } from "./utils/offlineAnalytics";

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
  if (filters.profileId && String(trade.profileId || "") !== String(filters.profileId)) {
    return false;
  }
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
  const sharedToken = useMemo(() => {
    const path = String(window.location.pathname || "");
    const marker = "/shared/";
    if (!path.startsWith(marker)) {
      return "";
    }
    return decodeURIComponent(path.slice(marker.length));
  }, []);

  const storedSession = useMemo(() => readStoredAuthSession(), []);
  const [authLoading, setAuthLoading] = useState(true);
  const [token, setToken] = useState(() => storedSession.token || "");
  const [refreshToken, setRefreshToken] = useState(() => storedSession.refreshToken || "");
  const [user, setUser] = useState(null);
  const [filters, setFilters] = useState({
    profileId: "",
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
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [showSettingsPanel, setShowSettingsPanel] = useState(true);
  const [settingsSavedAt, setSettingsSavedAt] = useState("");
  const [activePage, setActivePage] = useState("journal");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const syncInFlightRef = useRef(false);

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
    if (token || refreshToken) {
      persistAuthSession({ token, refreshToken });
    }
  }, [refreshToken, token]);

  useEffect(() => {
    const loadSession = async () => {
      if (sharedToken) {
        setAuthLoading(false);
        return;
      }

      if (!token) {
        setAuthLoading(false);
        return;
      }

      try {
        const me = await fetchMe(token);
        setUser(me.user);
        setFilters((prev) => ({
          ...prev,
          profileId: me.user?.activeProfileId || prev.profileId,
        }));
      } catch {
        clearAuthSession();
        setToken("");
        setRefreshToken("");
        setUser(null);
      } finally {
        setAuthLoading(false);
      }
    };

    loadSession();
  }, [sharedToken, token]);

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
      const latestSession = readStoredAuthSession();
      if (latestSession.token && latestSession.token !== token) {
        setToken(latestSession.token);
      }
      if (latestSession.refreshToken && latestSession.refreshToken !== refreshToken) {
        setRefreshToken(latestSession.refreshToken);
      }

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
  }, [filters, refreshToken, token, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!user?.activeProfileId) {
      return;
    }
    if (filters.profileId !== user.activeProfileId) {
      setFilters((prev) => ({
        ...prev,
        profileId: user.activeProfileId,
      }));
    }
  }, [filters.profileId, user?.activeProfileId]);

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

  const syncQueuedData = useCallback(async (manual = false) => {
    if (syncInFlightRef.current) {
      return;
    }

    if (!token || !user) {
      return;
    }

    if (!isOnline) {
      if (manual) {
        setStatusMessage("You are offline. Queue will sync automatically when internet returns.");
      }
      return;
    }

    const hasPendingQueue = getOfflineQueue().length > 0;
    if (!hasPendingQueue) {
      refreshOfflineQueue();
      if (manual) {
        setStatusMessage("No queued offline trades to sync.");
      }
      return;
    }

    syncInFlightRef.current = true;
    setSyncingQueue(true);

    try {
      const syncResult = await syncOfflineQueue(token);
      refreshOfflineQueue();
      const latestSession = readStoredAuthSession();
      if (latestSession.token && latestSession.token !== token) {
        setToken(latestSession.token);
      }
      if (latestSession.refreshToken && latestSession.refreshToken !== refreshToken) {
        setRefreshToken(latestSession.refreshToken);
      }

      if (syncResult.synced > 0) {
        await loadData();
        setStatusMessage(`Synced ${syncResult.synced} offline trade${syncResult.synced === 1 ? "" : "s"}.`);
      } else if (manual) {
        setStatusMessage("Sync checked. Queued trades are waiting for retry window or review.");
      }

      if (syncResult.failed > 0) {
        const firstError = syncResult.errors?.[0]?.message || "Some offline trades could not sync.";
        setError(firstError);
      }
    } catch (syncError) {
      setError(syncError.message || "Failed to sync queued trades.");
    } finally {
      syncInFlightRef.current = false;
      setSyncingQueue(false);
    }
  }, [isOnline, loadData, refreshOfflineQueue, refreshToken, token, user]);

  useEffect(() => {
    syncQueuedData();
  }, [syncQueuedData]);

  useEffect(() => {
    if (!isOnline || !token || !user) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      syncQueuedData();
    }, 20000);

    return () => window.clearInterval(timer);
  }, [isOnline, syncQueuedData, token, user]);

  const handleClearQueuedTrades = async () => {
    const shouldClear = window.confirm("Clear queued offline trades? This cannot be undone.");
    if (!shouldClear) {
      return;
    }

    try {
      const result = await clearOfflineQueue();
      refreshOfflineQueue();
      setError("");
      setStatusMessage(`Cleared ${result.cleared} queued trade${result.cleared === 1 ? "" : "s"}.`);
    } catch (clearError) {
      setError(clearError.message || "Could not clear queue.");
    }
  };

  const onAuthenticated = ({ token: nextToken, refreshToken: nextRefreshToken = "", user: nextUser }) => {
    setToken(nextToken);
    setRefreshToken(nextRefreshToken || refreshToken);
    setUser(nextUser);
    setFilters((prev) => ({
      ...prev,
      profileId: nextUser?.activeProfileId || prev.profileId,
    }));
    setError("");
    setStatusMessage("");
    refreshOfflineQueue();
  };

  const onLogout = async () => {
    try {
      await logoutSession({ token, refreshToken });
    } catch {
      // Best effort logout when network is unavailable.
    }

    clearAuthSession();
    setToken("");
    setRefreshToken("");
    setUser(null);
    setFilters({
      profileId: "",
      pair: "",
      session: "",
      setupType: "",
      cleanOnly: false,
    });
    setTrades([]);
    setOfflineQueue([]);
    setAnalytics(emptyAnalytics);
    setError("");
    setStatusMessage("");
    setSyncingQueue(false);
    syncInFlightRef.current = false;
  };

  const onSettingsSaved = () => {
    setShowSettingsPanel(false);
    setSettingsSavedAt(new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
    setActivePage("journal");
  };

  const handleProfileSwitch = async (profileId) => {
    if (!profileId || profileId === user?.activeProfileId) {
      return;
    }

    try {
      const response = await setActiveProfile(token, profileId);
      setToken(response.token || token);
      setUser(response.user);
      setFilters((prev) => ({
        ...prev,
        profileId,
      }));
      setStatusMessage(`Switched to profile: ${(response.user?.profiles || []).find((p) => p.id === profileId)?.name || profileId}`);
      setError("");
    } catch (switchError) {
      setError(switchError.message || "Could not switch profile.");
    }
  };

  const handleCreateProfile = async () => {
    const name = window.prompt("New profile name");
    if (!name || !name.trim()) {
      return;
    }

    try {
      const response = await createProfile(token, {
        name: name.trim(),
        description: "",
        makeActive: true,
      });
      setUser(response.user);
      setFilters((prev) => ({
        ...prev,
        profileId: response.user?.activeProfileId || prev.profileId,
      }));
      setStatusMessage(`Created profile: ${name.trim()}`);
      setError("");
    } catch (createError) {
      setError(createError.message || "Could not create profile.");
    }
  };

  const handleQuickSave = () => {
    if (activePage !== "journal") {
      setActivePage("journal");
      setStatusMessage("Journal page ready. Tap Save again to submit.");
      return;
    }
    window.dispatchEvent(new Event("journal-save-request"));
  };

  const handleQuickNew = () => {
    if (activePage !== "journal") {
      setActivePage("journal");
      setStatusMessage("Journal page ready. Tap New again to reset the form.");
      return;
    }
    window.dispatchEvent(new Event("journal-new-request"));
    setStatusMessage("Trade form reset.");
  };

  const queuedTrades = useMemo(
    () =>
      offlineQueue
        .map((item) => item.displayTrade)
        .filter((trade) => matchesTradeFilters(trade, filters)),
    [filters, offlineQueue]
  );

  const mergedTrades = useMemo(() => [...queuedTrades, ...trades], [queuedTrades, trades]);
  const localAnalytics = useMemo(() => buildLocalDashboardAnalytics(mergedTrades), [mergedTrades]);
  const displayAnalytics = useMemo(
    () => ((!isOnline || offlineQueue.length) ? localAnalytics : analytics || emptyAnalytics),
    [analytics, isOnline, localAnalytics, offlineQueue.length]
  );

  const strategySignal = useMemo(() => {
    if (offlineQueue.length) {
      return `${offlineQueue.length} trade${offlineQueue.length === 1 ? "" : "s"} queued offline.`;
    }

    if (!displayAnalytics.overview.totalTrades) {
      return "No data yet. Log your first Asia High/Low reaction.";
    }

    const bestTag = displayAnalytics.tagAnalytics.bestConditions?.[0]?.label;
    if (bestTag) {
      return `Best edge so far: ${bestTag}`;
    }

    return "Keep tagging Acceptance vs Rejection to reveal your edge.";
  }, [displayAnalytics, offlineQueue.length]);

  const queueInsights = useMemo(() => {
    if (!offlineQueue.length) {
      return null;
    }

    const failedItems = offlineQueue.filter((item) => Boolean(item.lastError));
    const waitingItems = offlineQueue.filter((item) => {
      const retryAt = item.nextRetryAt ? new Date(item.nextRetryAt).getTime() : 0;
      return retryAt > Date.now();
    });

    const nextRetryAt = waitingItems
      .map((item) => item.nextRetryAt)
      .filter(Boolean)
      .sort((a, b) => new Date(a).getTime() - new Date(b).getTime())[0];

    return {
      total: offlineQueue.length,
      failed: failedItems.length,
      waiting: waitingItems.length,
      nextRetryLabel: formatSyncTime(nextRetryAt),
      firstError: failedItems[0]?.lastError || "",
    };
  }, [offlineQueue]);

  if (authLoading) {
    return (
      <main className="mx-auto flex min-h-screen w-full max-w-[560px] items-center justify-center p-4">
        <section className="panel text-sm text-textMuted">Loading session...</section>
      </main>
    );
  }

  if (sharedToken) {
    return <SharedWeeklyView shareToken={sharedToken} />;
  }

  if (!token || !user) {
    return <AuthPanel onAuthenticated={onAuthenticated} />;
  }

  return (
    <main className="app-shell mx-auto w-full max-w-[1600px] p-0 pb-20 sm:p-3 sm:pb-20 md:p-5 md:pb-5">
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
              <div className="mt-2 flex gap-2">
                <select
                  className="input !h-9 !rounded-full !py-1 text-xs"
                  value={filters.profileId || user.activeProfileId || ""}
                  onChange={(event) => handleProfileSwitch(event.target.value)}
                >
                  {(user.profiles || []).map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  className="chip text-textMain transition hover:border-accent"
                  onClick={handleCreateProfile}
                >
                  New profile
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="chip">
                  {loading || syncingQueue ? "Syncing..." : isOnline ? "Online" : "Offline"}
                </span>
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
          {queueInsights ? (
            <div className="mb-4 rounded-md border border-border bg-panelMuted p-3 text-sm text-textMuted">
              <p>
                Queue: {queueInsights.total} pending
                {queueInsights.failed ? ` | ${queueInsights.failed} need review` : ""}
                {queueInsights.waiting && queueInsights.nextRetryLabel
                  ? ` | next retry ${queueInsights.nextRetryLabel}`
                  : ""}
              </p>
              {queueInsights.firstError ? <p className="mt-1 text-danger">{queueInsights.firstError}</p> : null}
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <button
                  type="button"
                  className="chip text-textMain transition hover:border-accent"
                  onClick={() => syncQueuedData(true)}
                  disabled={!isOnline || syncingQueue}
                >
                  {syncingQueue ? "Syncing..." : "Retry sync now"}
                </button>
                <button
                  type="button"
                  className="chip text-textMain transition hover:border-danger"
                  onClick={handleClearQueuedTrades}
                  disabled={syncingQueue}
                >
                  Clear queue
                </button>
              </div>
            </div>
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
              <StatCards
                overview={displayAnalytics.overview}
                cleanOnlyPerformance={displayAnalytics.cleanOnlyPerformance}
              />
            </section>
          ) : null}

          {activePage === "journal" ? (
            <section className="space-y-4">
              <div className="section-title">
                <h2>Trade Entry</h2>
                <p>Execution</p>
              </div>
              <TradeEntryForm
                onTradeSaved={onTradeSaved}
                token={token}
                settings={user.settings}
                trades={mergedTrades}
                activeProfileId={filters.profileId}
              />
            </section>
          ) : null}

          {activePage === "analytics" ? (
            <section className="space-y-4">
              <div className="section-title">
                <h2>Analytics</h2>
                <p>Performance</p>
              </div>
              <StatCards
                overview={displayAnalytics.overview}
                cleanOnlyPerformance={displayAnalytics.cleanOnlyPerformance}
              />
              <BehaviorLab trades={mergedTrades} />
              <StreakTracker streaks={displayAnalytics.streaks} />
              <ProfitCurveChart points={displayAnalytics.profitCurve} />
              <DrawdownChart points={displayAnalytics.drawdownCurve} />
              <SetupBreakdown setupBreakdown={displayAnalytics.setupBreakdown} />
              <TagAnalytics
                tagAnalytics={displayAnalytics.tagAnalytics}
                cleanOnlyPerformance={displayAnalytics.cleanOnlyPerformance}
                conditionScores={displayAnalytics.conditionScores}
              />
            </section>
          ) : null}

          {activePage === "review" ? (
            <section className="space-y-4">
              <div className="section-title">
                <h2>Review & Boards</h2>
                <p>Reflection</p>
              </div>
              <CalendarConsistency trades={mergedTrades} />
              <HeatmapMatrix heatmap={displayAnalytics.heatmap} />
              <CoachingSummary coaching={displayAnalytics.coaching} />
              <ScreenshotReplay trades={mergedTrades} />
              <WeeklyReviewReport token={token} profileId={filters.profileId} />
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
                <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
                  <SettingsPanel
                    user={user}
                    token={token}
                    onUserUpdate={setUser}
                    onSaved={onSettingsSaved}
                  />
                  <DataTools token={token} filters={filters} onImported={loadData} />
                  <AccountSecurityPanel user={user} token={token} onUserUpdate={setUser} />
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
                  <AccountSecurityPanel user={user} token={token} onUserUpdate={setUser} />
                  <DataTools token={token} filters={filters} onImported={loadData} />
                </div>
              )}
            </section>
          ) : null}
        </section>
      </section>
      <nav className="mobile-action-bar md:hidden">
        <button type="button" className="mobile-action-btn" onClick={handleQuickNew}>
          New
        </button>
        <button type="button" className="mobile-action-btn mobile-action-btn-primary" onClick={handleQuickSave}>
          Save
        </button>
        <button type="button" className="mobile-action-btn" onClick={() => setActivePage("analytics")}>
          Analytics
        </button>
      </nav>
    </main>
  );
};

export default App;
