import { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearCachedAuthProfile,
  clearAuthSession,
  clearOfflineQueue,
  createProfile,
  ensureLocalDeviceId,
  fetchAnalytics,
  fetchMe,
  fetchTrades,
  getOfflineQueue,
  isNetworkError,
  logoutSession,
  persistCachedAuthProfile,
  persistAuthSession,
  readCachedAuthProfile,
  readOfflineSnapshot,
  readStoredAuthSession,
  saveOfflineSnapshot,
  setActiveProfile,
  syncOfflineQueue,
  unlockTrustedDevice,
} from "./api/tradesApi";
import AuthPanel from "./components/AuthPanel";
import BrandLogo from "./components/BrandLogo";
import SharedWeeklyView from "./components/SharedWeeklyView";
import { buildLocalDashboardAnalytics } from "./utils/offlineAnalytics";

const AccountSecurityPanel = lazy(() => import("./components/AccountSecurityPanel"));
const BehaviorLab = lazy(() => import("./components/BehaviorLab"));
const CalendarConsistency = lazy(() => import("./components/CalendarConsistency"));
const CoachingSummary = lazy(() => import("./components/CoachingSummary"));
const DataTools = lazy(() => import("./components/DataTools"));
const DrawdownChart = lazy(() => import("./components/DrawdownChart"));
const FiltersBar = lazy(() => import("./components/FiltersBar"));
const HeatmapMatrix = lazy(() => import("./components/HeatmapMatrix"));
const ProfitCurveChart = lazy(() => import("./components/ProfitCurveChart"));
const ScreenshotReplay = lazy(() => import("./components/ScreenshotReplay"));
const SessionPerformanceGraph = lazy(() => import("./components/SessionPerformanceGraph"));
const SettingsPanel = lazy(() => import("./components/SettingsPanel"));
const SetupBreakdown = lazy(() => import("./components/SetupBreakdown"));
const StatCards = lazy(() => import("./components/StatCards"));
const StreakTracker = lazy(() => import("./components/StreakTracker"));
const TagAnalytics = lazy(() => import("./components/TagAnalytics"));
const TradeEntryForm = lazy(() => import("./components/TradeEntryForm"));
const TradesTable = lazy(() => import("./components/TradesTable"));
const WeeklyReviewReport = lazy(() => import("./components/WeeklyReviewReport"));

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

const PAGE_SHORTCUTS = ["1", "2", "3", "4", "5"];

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

const PAGE_STORAGE_KEY = "trading-journal-active-page";
const ADVANCED_ANALYTICS_STORAGE_KEY = "trading-journal-advanced-analytics";

const SectionLoader = ({ label = "Loading section..." }) => (
  <section className="panel animate-riseIn">
    <p className="text-sm text-textMuted">{label}</p>
  </section>
);

const useDebouncedValue = (value, delayMs = 320) => {
  const [debouncedValue, setDebouncedValue] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      setDebouncedValue(value);
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [delayMs, value]);

  return debouncedValue;
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
  const [authLoading, setAuthLoading] = useState(() => Boolean(storedSession.token));
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
  const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState(() => {
    return localStorage.getItem(ADVANCED_ANALYTICS_STORAGE_KEY) === "1";
  });
  const [activePage, setActivePage] = useState(() => {
    const stored = localStorage.getItem(PAGE_STORAGE_KEY);
    return PAGES.some((page) => page.key === stored) ? stored : "journal";
  });
  const [isCompactMobile, setIsCompactMobile] = useState(() =>
    window.matchMedia ? window.matchMedia("(max-width: 768px)").matches : false
  );
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [profileModalOpen, setProfileModalOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileDescription, setNewProfileDescription] = useState("");
  const [creatingProfile, setCreatingProfile] = useState(false);
  const syncInFlightRef = useRef(false);
  const loadRequestSeqRef = useRef(0);
  const debouncedFilters = useDebouncedValue(filters, 320);
  const includeDetailedTrades = activePage === "review";

  const refreshOfflineQueue = useCallback(() => {
    setOfflineQueue(getOfflineQueue());
  }, []);

  useEffect(() => {
    refreshOfflineQueue();
  }, [refreshOfflineQueue]);

  useEffect(() => {
    if (!window.matchMedia) {
      return undefined;
    }

    const media = window.matchMedia("(max-width: 768px)");
    const update = () => setIsCompactMobile(media.matches);
    update();

    if (media.addEventListener) {
      media.addEventListener("change", update);
      return () => media.removeEventListener("change", update);
    }

    media.addListener(update);
    return () => media.removeListener(update);
  }, []);

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
    ensureLocalDeviceId();
  }, []);

  useEffect(() => {
    if (token || refreshToken) {
      persistAuthSession({ token, refreshToken });
    }
  }, [refreshToken, token]);

  useEffect(() => {
    if (!user) {
      return;
    }
    void persistCachedAuthProfile(user).catch(() => {
      // Ignore local cache write errors.
    });
  }, [user]);

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

      let cachedProfile = await readCachedAuthProfile();
      const cachedUser = cachedProfile?.user || null;
      if (cachedUser) {
        setUser((prev) => prev || cachedUser);
        setFilters((prev) => ({
          ...prev,
          profileId: cachedUser?.activeProfileId || prev.profileId,
        }));
        setAuthLoading(false);
      }

      if (!cachedUser && cachedProfile?.encrypted && cachedProfile.locked && !navigator.onLine) {
        const enteredPin = window.prompt("Offline mode: enter your trusted-device PIN to unlock this session.");
        if (enteredPin) {
          try {
            await unlockTrustedDevice(enteredPin);
            cachedProfile = await readCachedAuthProfile();
            if (cachedProfile?.user) {
              setUser(cachedProfile.user);
              setFilters((prev) => ({
                ...prev,
                profileId: cachedProfile.user?.activeProfileId || prev.profileId,
              }));
              setStatusMessage("Trusted device unlocked. Offline session restored.");
              setError("");
            }
          } catch (unlockError) {
            setError(unlockError.message || "Could not unlock trusted device session.");
          }
        }
      }

      if (!navigator.onLine) {
        if (cachedUser || cachedProfile?.user) {
          setStatusMessage("Offline mode: using this device's saved session.");
          setError("");
        } else if (cachedProfile?.encrypted && cachedProfile.locked) {
          setStatusMessage("Offline mode: unlock trusted device with PIN to continue.");
        }
        setAuthLoading(false);
        return;
      }

      try {
        const me = await fetchMe(token);
        setUser(me.user);
        void persistCachedAuthProfile(me.user).catch(() => {
          // Ignore local cache write errors.
        });
        setFilters((prev) => ({
          ...prev,
          profileId: me.user?.activeProfileId || prev.profileId,
        }));
        setError("");
      } catch (sessionError) {
        if (isNetworkError(sessionError)) {
          if (cachedUser) {
            setStatusMessage("Offline mode: using this device's saved session.");
            setError("");
          }
          setAuthLoading(false);
          return;
        }

        clearAuthSession();
        clearCachedAuthProfile();
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

    const requestSeq = loadRequestSeqRef.current + 1;
    loadRequestSeqRef.current = requestSeq;
    setLoading(true);
    setError("");
    setStatusMessage("");
    try {
      const tradeLimit = isCompactMobile ? 220 : 500;
      const [tradesResponse, analyticsResponse] = await Promise.all([
        fetchTrades({ ...debouncedFilters, limit: tradeLimit, includeDetails: includeDetailedTrades }, token),
        fetchAnalytics(debouncedFilters, token),
      ]);

      if (requestSeq !== loadRequestSeqRef.current) {
        return;
      }

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
        filters: debouncedFilters,
      });
    } catch (fetchError) {
      if (requestSeq !== loadRequestSeqRef.current) {
        return;
      }

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
      if (requestSeq === loadRequestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [debouncedFilters, includeDetailedTrades, isCompactMobile, refreshToken, token, user]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  useEffect(() => {
    if (!token || !user) {
      return undefined;
    }

    const preloadNonCriticalChunks = () => {
      import("./components/StatCards");
      import("./components/ProfitCurveChart");
      import("./components/DrawdownChart");
      import("./components/BehaviorLab");
      import("./components/TagAnalytics");
      import("./components/SettingsPanel");
      import("./components/TradesTable");
    };

    if ("requestIdleCallback" in window) {
      const idleId = window.requestIdleCallback(preloadNonCriticalChunks, {
        timeout: 2500,
      });
      return () => window.cancelIdleCallback(idleId);
    }

    const timerId = window.setTimeout(preloadNonCriticalChunks, 1200);
    return () => window.clearTimeout(timerId);
  }, [token, user]);

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

  const onFilterChange = useCallback((key, value) => {
    setFilters((prev) => ({
      ...prev,
      [key]: value,
    }));
  }, []);

  const activeFilterCount = useMemo(() => {
    let count = 0;
    if (filters.pair) {
      count += 1;
    }
    if (filters.session) {
      count += 1;
    }
    if (filters.setupType) {
      count += 1;
    }
    if (filters.cleanOnly) {
      count += 1;
    }
    return count;
  }, [filters.cleanOnly, filters.pair, filters.session, filters.setupType]);

  const onTradeSaved = useCallback((event = {}) => {
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
  }, [loadData, refreshOfflineQueue]);

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
    if (nextUser) {
      void persistCachedAuthProfile(nextUser).catch(() => {
        // Ignore local cache write errors.
      });
    }
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
    clearCachedAuthProfile();
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
    const name = String(newProfileName || "").trim();
    if (name.length < 2) {
      setError("Profile name must be at least 2 characters.");
      return;
    }

    setCreatingProfile(true);
    try {
      const response = await createProfile(token, {
        name,
        description: String(newProfileDescription || "").trim(),
        makeActive: true,
      });
      setUser(response.user);
      setFilters((prev) => ({
        ...prev,
        profileId: response.user?.activeProfileId || prev.profileId,
      }));
      setStatusMessage(`Created profile: ${name}`);
      setError("");
      setNewProfileName("");
      setNewProfileDescription("");
      setProfileModalOpen(false);
    } catch (createError) {
      setError(createError.message || "Could not create profile.");
    } finally {
      setCreatingProfile(false);
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
  const shouldUseLocalAnalytics = !isOnline || offlineQueue.length > 0;
  const localAnalytics = useMemo(() => {
    if (!shouldUseLocalAnalytics) {
      return null;
    }
    return buildLocalDashboardAnalytics(mergedTrades);
  }, [mergedTrades, shouldUseLocalAnalytics]);
  const displayAnalytics = useMemo(() => {
    if (shouldUseLocalAnalytics) {
      return localAnalytics || emptyAnalytics;
    }
    return analytics || emptyAnalytics;
  }, [analytics, localAnalytics, shouldUseLocalAnalytics]);

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

  useEffect(() => {
    localStorage.setItem(PAGE_STORAGE_KEY, activePage);
  }, [activePage]);

  useEffect(() => {
    localStorage.setItem(ADVANCED_ANALYTICS_STORAGE_KEY, showAdvancedAnalytics ? "1" : "0");
  }, [showAdvancedAnalytics]);

  useEffect(() => {
    const onKeyDown = (event) => {
      if (profileModalOpen && event.key === "Escape") {
        setProfileModalOpen(false);
        return;
      }

      if (!event.altKey || event.ctrlKey || event.metaKey) {
        return;
      }

      const index = PAGE_SHORTCUTS.indexOf(event.key);
      if (index < 0 || !PAGES[index]) {
        return;
      }

      event.preventDefault();
      setActivePage(PAGES[index].key);
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [profileModalOpen]);

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
      {loading || syncingQueue ? <div className="top-loader" aria-hidden="true" /> : null}
      <section className="journal-shell app-journal p-0 sm:p-4 md:p-6">
        <header className="journal-hero mb-4 md:mb-5">
          <div className="top-header">
            <div className="brand-block">
              <BrandLogo />
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
                  onClick={() => setProfileModalOpen(true)}
                >
                  New profile
                </button>
              </div>
              <div className="mt-2 flex flex-wrap gap-2 text-xs">
                <span className="chip">
                  {loading || syncingQueue ? "Syncing..." : isOnline ? "Online" : "Offline"}
                </span>
                <span className="chip hidden sm:inline-flex">Alt+1..5 pages</span>
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
            <div className="flex items-center justify-between gap-2">
              <p className="section-kicker">Pages</p>
              <div className="flex flex-wrap items-center gap-2 text-xs">
                <span className="chip">{activeFilterCount} active filters</span>
                {loading ? <span className="chip skeleton h-6 w-16" aria-hidden="true" /> : null}
              </div>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {PAGES.map((page, index) => (
                <button
                  key={page.key}
                  type="button"
                  className={`chip page-btn ${activePage === page.key ? "page-btn-active" : ""}`}
                  onClick={() => setActivePage(page.key)}
                >
                  {page.label}
                  <span className="ml-1 hidden text-[10px] text-textMuted sm:inline">({PAGE_SHORTCUTS[index]})</span>
                </button>
              ))}
            </div>
          </div>

          {error ? (
            <p
              className="mb-4 rounded-xl border border-danger/40 bg-danger/10 p-3 text-sm text-danger"
              role="alert"
              aria-live="assertive"
            >
              {error}
            </p>
          ) : null}
          {statusMessage ? (
            <p
              className="mb-4 rounded-xl border border-border bg-panelMuted p-3 text-sm text-textMuted"
              role="status"
              aria-live="polite"
            >
              {statusMessage}
            </p>
          ) : null}
          {queueInsights ? (
            <div className="mb-4 rounded-xl border border-border bg-panelMuted p-3 text-sm text-textMuted">
              <p>
                Queue: {queueInsights.total} pending
                {queueInsights.failed ? ` | ${queueInsights.failed} need review` : ""}
                {queueInsights.waiting && queueInsights.nextRetryLabel
                  ? ` | next retry ${queueInsights.nextRetryLabel}`
                  : ""}
              </p>
              {queueInsights.firstError ? (
                <p className="mt-1 text-danger" role="alert" aria-live="assertive">
                  {queueInsights.firstError}
                </p>
              ) : null}
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

          {loading && !mergedTrades.length ? (
            <section className="panel skeleton mb-4 h-24" aria-hidden="true" />
          ) : null}

          {activePage === "dashboard" ? (
            <Suspense fallback={<SectionLoader label="Loading dashboard..." />}>
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
            </Suspense>
          ) : null}

          {activePage === "journal" ? (
            <Suspense fallback={<SectionLoader label="Loading journal..." />}>
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
            </Suspense>
          ) : null}

          {activePage === "analytics" ? (
            <Suspense fallback={<SectionLoader label="Loading analytics..." />}>
              <section className="space-y-4">
                <div className="section-title">
                  <h2>Analytics</h2>
                  <p>Performance</p>
                </div>
                <div className="soft-frame flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm text-textMuted">
                    Core analytics stay visible. Advanced panels are optional to reduce noise.
                  </p>
                  <button
                    type="button"
                    className="chip text-textMain transition hover:border-accent"
                    onClick={() => setShowAdvancedAnalytics((prev) => !prev)}
                  >
                    {showAdvancedAnalytics ? "Hide advanced analytics" : "Show advanced analytics"}
                  </button>
                </div>
                <StatCards
                  overview={displayAnalytics.overview}
                  cleanOnlyPerformance={displayAnalytics.cleanOnlyPerformance}
                />
                <BehaviorLab trades={mergedTrades} />
                <ProfitCurveChart points={displayAnalytics.profitCurve} />
                <SetupBreakdown setupBreakdown={displayAnalytics.setupBreakdown} />
                {showAdvancedAnalytics ? (
                  <>
                    <StreakTracker streaks={displayAnalytics.streaks} />
                    <DrawdownChart points={displayAnalytics.drawdownCurve} />
                    <TagAnalytics
                      tagAnalytics={displayAnalytics.tagAnalytics}
                      cleanOnlyPerformance={displayAnalytics.cleanOnlyPerformance}
                      conditionScores={displayAnalytics.conditionScores}
                    />
                  </>
                ) : null}
              </section>
            </Suspense>
          ) : null}

          {activePage === "review" ? (
            <Suspense fallback={<SectionLoader label="Loading review..." />}>
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
            </Suspense>
          ) : null}

          {activePage === "settings" ? (
            <Suspense fallback={<SectionLoader label="Loading settings..." />}>
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
            </Suspense>
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
      {profileModalOpen ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="Create profile"
          onClick={() => setProfileModalOpen(false)}
        >
          <form
            className="modal-card animate-riseIn"
            onSubmit={(event) => {
              event.preventDefault();
              handleCreateProfile();
            }}
            onClick={(event) => event.stopPropagation()}
          >
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-base font-semibold">Create profile</h2>
              <button
                type="button"
                className="chip text-textMain transition hover:border-accent"
                onClick={() => setProfileModalOpen(false)}
              >
                Close
              </button>
            </div>
            <label>
              <span className="label">Profile name</span>
              <input
                className="input"
                value={newProfileName}
                onChange={(event) => setNewProfileName(event.target.value)}
                placeholder="Scalping plan / profile name"
                autoFocus
              />
            </label>
            <label className="mt-2 block">
              <span className="label">Description (optional)</span>
              <textarea
                className="input min-h-24"
                value={newProfileDescription}
                onChange={(event) => setNewProfileDescription(event.target.value)}
                placeholder="Short note about this profile"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="submit" className="btn-primary" disabled={creatingProfile}>
                {creatingProfile ? "Creating..." : "Create profile"}
              </button>
              <button
                type="button"
                className="chip text-textMain transition hover:border-accent"
                onClick={() => setProfileModalOpen(false)}
                disabled={creatingProfile}
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
};

export default App;
