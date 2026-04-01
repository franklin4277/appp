import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  clearCachedAuthProfile,
  clearAuthSession,
  clearOfflineQueue,
  createProfile,
  createTrade,
  disableMt5Bridge,
  ensureLocalDeviceId,
  fetchAnalytics,
  fetchMe,
  fetchTradeById,
  fetchTrades,
  exportTradesCsv,
  generateMt5BridgeKey,
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
  updateUserSettings,
  unlockTrustedDevice,
} from "./api/tradesApi";
import { PAIRS } from "./utils/options";
import AuthPanel from "./components/AuthPanel";
import ResetPasswordView from "./components/ResetPasswordView";
import SharedWeeklyView from "./components/SharedWeeklyView";
import SaasWorkspace from "./components/SaasWorkspace";
import VerifyEmailView from "./components/VerifyEmailView";
import { buildLocalDashboardAnalytics } from "./utils/offlineAnalytics";
import { buildEdgeInsights } from "./utils/insights";
import {
  ADVANCED_ANALYTICS_STORAGE_KEY,
  PAGES,
  PAGE_SHORTCUTS,
  PAGE_STORAGE_KEY,
} from "./utils/appNavigation";
import { formatSyncTime, matchesTradeFilters } from "./utils/tradeFilters";
import ToastStack from "./components/ToastStack";
import { dayKey, dayNameToIndex, readRetentionPreferences, weekKey } from "./utils/retention";
import { applyTheme, resolveInitialTheme } from "./utils/theme";

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
  fingerprintPerformance: {
    best: [],
    all: [],
  },
  edgeHighlights: {
    expectancy: 0,
    bestSetup: null,
    bestSession: null,
    bestCondition: null,
    worstHabit: null,
    notifications: [],
  },
  lifecycle: {
    openTrades: 0,
    closedTrades: 0,
    includeOpen: false,
  },
  coaching: {
    daily: { strengths: [], mistakes: [] },
    weekly: { strengths: [], mistakes: [] },
  },
};

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

const pageMeta = {
  dashboard: {
    title: "Dashboard",
    subtitle: "Track your trading performance at a glance",
  },
  journal: {
    title: "Add New Trade",
    subtitle: "Log your trade in under 60 seconds",
  },
  analytics: {
    title: "Analytics",
    subtitle: "Deep dive into your trading performance",
  },
  edge: {
    title: "Edge Detection",
    subtitle: "Discover what's working and what's not",
  },
  behavior: {
    title: "Behavior Tracking",
    subtitle: "Understand the psychology behind your trades",
  },
  review: {
    title: "Performance Review",
    subtitle: "Weekly and monthly performance breakdown",
  },
  settings: {
    title: "Settings",
    subtitle: "Manage workspace preferences and account actions",
  },
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const normalizePriceInput = (value) => {
  if (value === undefined || value === null) {
    return "";
  }
  return String(value).replace(/,/g, "").trim();
};

const normalizeEmotion = (value = "") =>
  String(value || "")
    .trim()
    .split(/[,\|/;]/)[0]
    .trim();

const round = (value, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const computeWinRate = (trades = []) => {
  if (!trades.length) {
    return 0;
  }
  const wins = trades.filter((trade) => String(trade?.result || "").toLowerCase() === "win").length;
  return round((wins / trades.length) * 100, 1);
};

const computeAverageRR = (trades = []) => {
  if (!trades.length) {
    return 0;
  }
  const net = trades.reduce((sum, trade) => sum + toNumber(trade?.rrAchieved), 0);
  return round(net / trades.length, 2);
};

const groupedStats = (trades = [], selector = () => "") =>
  Object.values(
    trades.reduce((acc, trade) => {
      const label = String(selector(trade) || "").trim() || "Unknown";
      if (!acc[label]) {
        acc[label] = {
          label,
          trades: 0,
          wins: 0,
          rr: 0,
        };
      }
      acc[label].trades += 1;
      if (String(trade?.result || "").toLowerCase() === "win") {
        acc[label].wins += 1;
      }
      acc[label].rr += toNumber(trade?.rrAchieved);
      return acc;
    }, {})
  )
    .map((item) => ({
      ...item,
      winRate: item.trades ? round((item.wins / item.trades) * 100, 1) : 0,
      avgRR: item.trades ? round(item.rr / item.trades, 2) : 0,
    }))
    .sort((a, b) => b.winRate - a.winRate || b.avgRR - a.avgRR);

const buildQuickTradeForm = ({ setupOptions = [], sessionOptions = [], pairOptions = [] } = {}) => ({
  tradeDate: new Date().toISOString().slice(0, 10),
  pair: pairOptions[0] || "",
  entryPrice: "",
  exitPrice: "",
  stopLoss: "",
  takeProfit: "",
  plannedRR: "",
  setupType: setupOptions[0] || "",
  session: sessionOptions[0] || "",
  emotion: "",
  followedPlan: true,
  notes: "",
  screenshotBefore: null,
  screenshotAfter: null,
});

const App = () => {
  const urlRoute = useMemo(() => {
    const rawPath = String(window.location.pathname || "");
    const path = rawPath.replace(/\/+$/, "") || "/";
    const params = new URLSearchParams(window.location.search || "");
    return {
      path,
      urlToken: String(params.get("token") || ""),
    };
  }, []);

  const sharedToken = useMemo(() => {
    const currentPath = String(window.location.pathname || "").replace(/\/+$/, "");
    const marker = "/shared/";
    if (!currentPath.startsWith(marker)) {
      return "";
    }
    return decodeURIComponent(currentPath.slice(marker.length));
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
  const [exportingCsv, setExportingCsv] = useState(false);
  const [statusMessage, setStatusMessage] = useState("");
  const [syncingQueue, setSyncingQueue] = useState(false);
  const [showAdvancedAnalytics, setShowAdvancedAnalytics] = useState(() => {
    return localStorage.getItem(ADVANCED_ANALYTICS_STORAGE_KEY) === "1";
  });
  const [reviewRange, setReviewRange] = useState("week");
  const [activePage, setActivePage] = useState(() => {
    const stored = localStorage.getItem(PAGE_STORAGE_KEY);
    return PAGES.some((page) => page.key === stored) ? stored : "journal";
  });
  const [isCompactMobile, setIsCompactMobile] = useState(() =>
    window.matchMedia ? window.matchMedia("(max-width: 768px)").matches : false
  );
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [offlineQueue, setOfflineQueue] = useState([]);
  const [theme, setTheme] = useState(() => resolveInitialTheme());
  const [toasts, setToasts] = useState([]);
  const [retentionPrefs, setRetentionPrefs] = useState(() => readRetentionPreferences());
  const [quickTradeForm, setQuickTradeForm] = useState(() => buildQuickTradeForm({ pairOptions: PAIRS }));
  const [savingQuickTrade, setSavingQuickTrade] = useState(false);
  const [creatingProfile, setCreatingProfile] = useState(false);
  const [savingUserSettings, setSavingUserSettings] = useState(false);
  const syncInFlightRef = useRef(false);
  const loadRequestSeqRef = useRef(0);
  const toastCounterRef = useRef(0);
  const reminderTickRef = useRef(null);
  const debouncedFilters = useDebouncedValue(filters, 180);
  const includeDetailedTrades = activePage === "review";
  const includeTotalTrades = activePage === "review";

  const refreshOfflineQueue = useCallback(() => {
    setOfflineQueue(getOfflineQueue());
  }, []);

  useEffect(() => {
    refreshOfflineQueue();
  }, [refreshOfflineQueue]);

  useEffect(() => {
    applyTheme(theme);
  }, [theme]);

  useEffect(() => {
    if (activePage !== "review" && reviewRange !== "week") {
      setReviewRange("week");
    }
  }, [activePage, reviewRange]);

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
    const tradeLimit = includeDetailedTrades
      ? isCompactMobile
        ? 260
        : 500
      : isCompactMobile
        ? 120
        : 220;

    const tradesPromise = fetchTrades(
      {
        ...debouncedFilters,
        limit: tradeLimit,
        includeDetails: includeDetailedTrades ? "true" : "false",
        includeTotal: includeTotalTrades ? "true" : "false",
      },
      token
    );
    const analyticsPromise = fetchAnalytics(debouncedFilters, token);

    let nextTrades = null;
    let nextAnalytics = null;

    const syncLatestSession = () => {
      const latestSession = readStoredAuthSession();
      if (latestSession.token && latestSession.token !== token) {
        setToken(latestSession.token);
      }
      if (latestSession.refreshToken && latestSession.refreshToken !== refreshToken) {
        setRefreshToken(latestSession.refreshToken);
      }
    };

    try {
      const tradesResponse = await tradesPromise;
      if (requestSeq !== loadRequestSeqRef.current) {
        return;
      }
      nextTrades = tradesResponse.data || [];
      syncLatestSession();
      setTrades(nextTrades);
      saveOfflineSnapshot({
        trades: nextTrades,
        analytics,
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
        return;
      }

      setError(fetchError.message);
      // Still try to fetch analytics (it can be useful even if trade list fails for other reasons).
    }

    try {
      const analyticsResponse = await analyticsPromise;
      if (requestSeq !== loadRequestSeqRef.current) {
        return;
      }
      nextAnalytics = analyticsResponse || emptyAnalytics;
      syncLatestSession();
      setAnalytics(nextAnalytics);
      saveOfflineSnapshot({
        trades: nextTrades ?? trades,
        analytics: nextAnalytics,
        filters: debouncedFilters,
      });
    } catch (fetchError) {
      if (requestSeq !== loadRequestSeqRef.current) {
        return;
      }

      if (isNetworkError(fetchError)) {
        const snapshot = readOfflineSnapshot();
        if (snapshot?.analytics) {
          setAnalytics(snapshot.analytics || emptyAnalytics);
          const syncedAt = formatSyncTime(snapshot.updatedAt);
          setStatusMessage(
            syncedAt
              ? `Offline mode: showing last synced data from ${syncedAt}.`
              : "Offline mode: showing last synced data."
          );
        }
        return;
      }

      setError(fetchError.message);
    } finally {
      if (requestSeq === loadRequestSeqRef.current) {
        setLoading(false);
      }
    }
  }, [debouncedFilters, includeDetailedTrades, includeTotalTrades, isCompactMobile, refreshToken, token, user]);

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

  const dismissToast = useCallback((id) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
  }, []);

  const pushToast = useCallback(
    (type, message) => {
      const text = String(message || "").trim();
      if (!text) {
        return;
      }

      toastCounterRef.current += 1;
      const id = `toast-${Date.now()}-${toastCounterRef.current}`;
      setToasts((prev) => [...prev.slice(-3), { id, type, message: text }]);
      window.setTimeout(() => dismissToast(id), 4200);
    },
    [dismissToast]
  );

  const maybeSendDesktopNotification = useCallback(
    (title, body) => {
      if (!retentionPrefs.desktopNotificationsEnabled) {
        return;
      }
      if (!("Notification" in window) || Notification.permission !== "granted") {
        return;
      }
      try {
        new Notification(title, {
          body,
          icon: "/pwa-192x192.png",
        });
      } catch {
        // Ignore notification dispatch errors.
      }
    },
    [retentionPrefs.desktopNotificationsEnabled]
  );

  useEffect(() => {
    if (!token || !user) {
      return undefined;
    }

    const checkReminders = () => {
      const now = new Date();
      const [dailyHour, dailyMinute] = String(retentionPrefs.dailyReminderTime || "20:00")
        .split(":")
        .map((item) => Number(item) || 0);
      const [weeklyHour, weeklyMinute] = String(retentionPrefs.weeklyReportTime || "21:00")
        .split(":")
        .map((item) => Number(item) || 0);

      const currentDayKey = dayKey(now);
      const currentWeekKey = weekKey(now);

      if (
        retentionPrefs.dailyReminderEnabled &&
        now.getHours() === dailyHour &&
        now.getMinutes() === dailyMinute
      ) {
        const key = `retention-daily-fired:${currentDayKey}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          const body = "Log your trades today to keep your edge data fresh.";
          pushToast("info", body);
          maybeSendDesktopNotification("Daily Trading Reminder", body);
        }
      }

      if (
        retentionPrefs.weeklyReportEnabled &&
        now.getDay() === dayNameToIndex(retentionPrefs.weeklyReportDay) &&
        now.getHours() === weeklyHour &&
        now.getMinutes() === weeklyMinute
      ) {
        const key = `retention-weekly-fired:${currentWeekKey}`;
        if (!localStorage.getItem(key)) {
          localStorage.setItem(key, "1");
          const body = "Open Weekly Review to inspect edge, behavior, and setup quality.";
          pushToast("info", body);
          maybeSendDesktopNotification("Weekly Performance Report", body);
        }
      }

      if (retentionPrefs.insightAlertsEnabled) {
        const edge = buildEdgeInsights({
          trades,
          analytics,
          riskControls: user?.settings?.riskControls || {},
        });
        const overtradingAlert = edge.notifications.find((item) => item.id === "overtrading");
        if (overtradingAlert) {
          const insightKey = `retention-insight-overtrading:${currentDayKey}`;
          if (!localStorage.getItem(insightKey)) {
            localStorage.setItem(insightKey, "1");
            pushToast("error", overtradingAlert.message);
            maybeSendDesktopNotification("Behavior Alert", overtradingAlert.message);
          }
        }
      }
    };

    checkReminders();
    reminderTickRef.current = window.setInterval(checkReminders, 60 * 1000);

    return () => {
      if (reminderTickRef.current) {
        window.clearInterval(reminderTickRef.current);
        reminderTickRef.current = null;
      }
    };
  }, [
    analytics,
    maybeSendDesktopNotification,
    retentionPrefs.dailyReminderEnabled,
    retentionPrefs.dailyReminderTime,
    retentionPrefs.insightAlertsEnabled,
    retentionPrefs.weeklyReportDay,
    retentionPrefs.weeklyReportEnabled,
    retentionPrefs.weeklyReportTime,
    token,
    trades,
    user,
    pushToast,
  ]);

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

    if (!offlineQueue.length) {
      return undefined;
    }

    const timer = window.setInterval(() => {
      syncQueuedData();
    }, 45000);

    return () => window.clearInterval(timer);
  }, [isOnline, offlineQueue.length, syncQueuedData, token, user]);

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

  const handleProfileCreate = async ({ name, description = "", makeActive = true } = {}) => {
    const trimmedName = String(name || "").trim();
    const trimmedDescription = String(description || "").trim();

    if (trimmedName.length < 2) {
      setError("Profile name must be at least 2 characters.");
      return null;
    }

    if (!token) {
      setError("You must be signed in to create a profile.");
      return null;
    }

    if (!isOnline) {
      setError("You're offline. Connect to the internet to create a profile.");
      return null;
    }

    setCreatingProfile(true);
    setError("");
    setStatusMessage("");

    try {
      const response = await createProfile(token, {
        name: trimmedName,
        description: trimmedDescription,
        makeActive,
      });

      if (response.user) {
        setUser(response.user);
      }

      if (makeActive && response.profile?.id) {
        setFilters((prev) => ({
          ...prev,
          profileId: response.profile.id,
        }));
      }

      setStatusMessage(`Profile created: ${response.profile?.name || trimmedName}`);
      return response.profile || null;
    } catch (createError) {
      setError(createError.message || "Could not create profile.");
      return null;
    } finally {
      setCreatingProfile(false);
    }
  };

  const handleUpdateUserSettings = async (payload = {}) => {
    if (!token) {
      setError("You must be signed in to update settings.");
      return null;
    }

    if (!isOnline) {
      setError("You're offline. Connect to the internet to update settings.");
      return null;
    }

    setSavingUserSettings(true);
    setError("");
    setStatusMessage("");

    try {
      const response = await updateUserSettings(token, payload);
      if (response?.user) {
        setUser(response.user);
      }
      setStatusMessage("Settings updated.");
      return response?.user || null;
    } catch (updateError) {
      setError(updateError.message || "Could not update settings.");
      return null;
    } finally {
      setSavingUserSettings(false);
    }
  };

  const handleGenerateMt5BridgeKey = async ({ label } = {}) => {
    if (!token) {
      setError("You must be signed in to generate a bridge key.");
      return null;
    }

    if (!isOnline) {
      setError("You're offline. Connect to the internet to generate a bridge key.");
      return null;
    }

    setError("");
    setStatusMessage("");

    try {
      const response = await generateMt5BridgeKey(token, { label });
      if (response?.user) {
        setUser(response.user);
      }
      setStatusMessage("Bridge key generated. Copy it now (shown once).");
      return response;
    } catch (bridgeError) {
      setError(bridgeError.message || "Could not generate MT5 bridge key.");
      return null;
    }
  };

  const handleDisableMt5Bridge = async () => {
    if (!token) {
      setError("You must be signed in to disable the bridge.");
      return null;
    }

    if (!isOnline) {
      setError("You're offline. Connect to the internet to disable the bridge.");
      return null;
    }

    setError("");
    setStatusMessage("");

    try {
      const response = await disableMt5Bridge(token);
      if (response?.user) {
        setUser(response.user);
      }
      setStatusMessage("MT5 bridge disabled.");
      return response;
    } catch (bridgeError) {
      setError(bridgeError.message || "Could not disable MT5 bridge.");
      return null;
    }
  };

  const handleFetchTradeDetails = useCallback(
    async (tradeId) => {
      if (!token) {
        return null;
      }
      if (!isOnline) {
        return null;
      }

      try {
        const trade = await fetchTradeById(tradeId, token);
        const latestSession = readStoredAuthSession();
        if (latestSession.token && latestSession.token !== token) {
          setToken(latestSession.token);
        }
        if (latestSession.refreshToken && latestSession.refreshToken !== refreshToken) {
          setRefreshToken(latestSession.refreshToken);
        }
        return trade || null;
      } catch {
        return null;
      }
    },
    [isOnline, refreshToken, token]
  );

  const handleExportTradesCsv = useCallback(async () => {
    if (!token) {
      setError("You must be signed in to export trades.");
      return;
    }

    if (!isOnline) {
      setError("You're offline. Connect to the internet to export trades.");
      return;
    }

    setExportingCsv(true);
    setError("");
    setStatusMessage("");

    try {
      const blob = await exportTradesCsv(filters, token);
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const date = new Date().toISOString().slice(0, 10);
      a.href = url;
      a.download = `trading-journal-${date}.csv`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      URL.revokeObjectURL(url);
      setStatusMessage("CSV export downloaded.");
    } catch (downloadError) {
      setError(downloadError.message || "Could not export CSV.");
    } finally {
      setExportingCsv(false);
    }
  }, [filters, isOnline, token]);

  const sessionOptions = useMemo(() => {
    const source = user?.settings?.options?.sessions;
    if (Array.isArray(source) && source.length) {
      return source;
    }
    return ["London", "New York", "Asia"];
  }, [user?.settings?.options?.sessions]);

  const pairOptions = useMemo(() => {
    const source = Array.isArray(user?.settings?.options?.pairs) && user?.settings?.options?.pairs.length
      ? user.settings.options.pairs
      : PAIRS;
    const normalized = source
      .map((pair) =>
        String(pair || "")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
      )
      .filter((pair) => pair.length >= 3 && pair.length <= 15);
    return normalized.length ? normalized : PAIRS;
  }, [user?.settings?.options?.pairs]);

  const setupOptions = useMemo(() => {
    const source = user?.settings?.options?.setupTypes;
    if (Array.isArray(source) && source.length) {
      return source;
    }
    return ["Breakout", "Trend Continuation", "Pullback", "Reversal", "Support/Resistance", "Range Trading"];
  }, [user?.settings?.options?.setupTypes]);

  useEffect(() => {
    setQuickTradeForm((prev) => {
      const nextPair = pairOptions.includes(prev.pair) ? prev.pair : pairOptions[0] || "";
      const nextSetup = prev.setupType || setupOptions[0] || "";
      const nextSession = prev.session || sessionOptions[0] || "";
      if (nextPair === prev.pair && nextSetup === prev.setupType && nextSession === prev.session) {
        return prev;
      }
      return {
        ...prev,
        pair: nextPair,
        setupType: nextSetup,
        session: nextSession,
      };
    });
  }, [pairOptions, sessionOptions, setupOptions]);

  const handleQuickTradeChange = useCallback((field, value) => {
    setQuickTradeForm((prev) => {
      if (field !== "pair") {
        return {
          ...prev,
          [field]: value,
        };
      }

      const normalizedPair = String(value || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "");
      return {
        ...prev,
        pair: normalizedPair,
      };
    });
  }, []);

  const resetQuickTradeForm = useCallback(() => {
    setQuickTradeForm(buildQuickTradeForm({ setupOptions, sessionOptions, pairOptions }));
  }, [pairOptions, sessionOptions, setupOptions]);

  const handleQuickTradeSubmit = useCallback(
    async (event) => {
      event.preventDefault();
      if (!token) {
        return;
      }

      const normalizedPair = String(quickTradeForm.pair || "").trim().toUpperCase();
      const sanitizedPair = normalizedPair.replace(/[^A-Z0-9]/g, "");
      const pair = sanitizedPair || pairOptions[0] || "";
      if (!sanitizedPair && pairOptions[0]) {
        setQuickTradeForm((prev) => ({ ...prev, pair: pairOptions[0] }));
      }
      const entryPrice = toNumber(normalizePriceInput(quickTradeForm.entryPrice), NaN);
      const exitPrice = quickTradeForm.exitPrice === "" ? NaN : toNumber(normalizePriceInput(quickTradeForm.exitPrice), NaN);
      const stopLossInput = normalizePriceInput(quickTradeForm.stopLoss);
      const takeProfitInput = normalizePriceInput(quickTradeForm.takeProfit);
      const stopLossValue = stopLossInput === "" ? NaN : toNumber(stopLossInput, NaN);
      const takeProfitValue = takeProfitInput === "" ? NaN : toNumber(takeProfitInput, NaN);
      const plannedRRInput = quickTradeForm.plannedRR === "" ? NaN : toNumber(quickTradeForm.plannedRR, NaN);
      if (!pair || pair.length < 3 || pair.length > 15 || !Number.isFinite(entryPrice) || entryPrice <= 0) {
        setError("Pair and entry price are required.");
        return;
      }
      if (quickTradeForm.plannedRR !== "" && (!Number.isFinite(plannedRRInput) || plannedRRInput <= 0)) {
        setError("Planned R:R must be greater than 0.");
        return;
      }

      const defaultStop = round(entryPrice * 0.995, 5);
      const defaultTake = round(entryPrice * 1.01, 5);
      const stopLoss = Number.isFinite(stopLossValue) && stopLossValue > 0 ? stopLossValue : defaultStop;
      const takeProfit = Number.isFinite(takeProfitValue) && takeProfitValue > 0 ? takeProfitValue : defaultTake;
      if (!Number.isFinite(stopLoss) || stopLoss <= 0 || !Number.isFinite(takeProfit) || takeProfit <= 0) {
        setError("Stop loss and take profit must be greater than 0.");
        return;
      }
      const plannedRR = Number.isFinite(plannedRRInput) && plannedRRInput > 0
        ? round(plannedRRInput, 2)
        : round(Math.abs(takeProfit - entryPrice) / Math.max(Math.abs(entryPrice - stopLoss), 0.00001), 2);
      const isWinning = Number.isFinite(exitPrice) ? exitPrice >= entryPrice : false;
      const result = Number.isFinite(exitPrice) ? (isWinning ? "Win" : "Loss") : "BE";
      const rrAchieved = Number.isFinite(exitPrice)
        ? round((Math.abs(exitPrice - entryPrice) / Math.max(Math.abs(entryPrice - stopLoss), 0.00001)) * (isWinning ? 1 : -1), 2)
        : 0;

      const safeSession = String(quickTradeForm.session || "").trim() || sessionOptions[0] || "London";
      if (!String(quickTradeForm.session || "").trim() && sessionOptions[0]) {
        setQuickTradeForm((prev) => ({ ...prev, session: sessionOptions[0] }));
      }
      const safeSetupType = String(quickTradeForm.setupType || "").trim() || setupOptions[0] || "Breakout";
      if (!String(quickTradeForm.setupType || "").trim() && setupOptions[0]) {
        setQuickTradeForm((prev) => ({ ...prev, setupType: setupOptions[0] }));
      }
      const data = new FormData();
      data.append("profileId", filters.profileId || user?.activeProfileId || "");
      data.append("pair", pair);
      data.append("tradeDate", quickTradeForm.tradeDate || new Date().toISOString().slice(0, 10));
      data.append("session", safeSession);
      data.append("tradeType", "Buy");
      data.append("setupType", safeSetupType);
      data.append("entryPrice", String(entryPrice));
      data.append("exitPrice", Number.isFinite(exitPrice) ? String(exitPrice) : "");
      data.append("stopLoss", String(stopLoss));
      data.append("takeProfit", String(takeProfit));
      data.append("plannedRR", String(plannedRR));
      data.append("riskPercent", "1");
      data.append("result", result);
      data.append("rrAchieved", String(rrAchieved));
      data.append("asiaHighLowUsed", "false");
      data.append("pocInteraction", "false");
      data.append("pocOutcome", "");
      data.append("cleanSetup", String(Boolean(quickTradeForm.followedPlan)));
      data.append("acceptGuardrailOverride", "true");
      data.append("ruleBreakReason", quickTradeForm.followedPlan ? "" : "Quick entry plan override");
      data.append("priceAction", "");
      data.append("executionReview", quickTradeForm.notes || "");
      data.append("emotionalState", quickTradeForm.emotion || "");
      if (quickTradeForm.screenshotBefore) {
        data.append("screenshotBefore", quickTradeForm.screenshotBefore);
      }
      if (quickTradeForm.screenshotAfter) {
        data.append("screenshotAfter", quickTradeForm.screenshotAfter);
      }

      setSavingQuickTrade(true);
      setError("");
      try {
        await createTrade(data, token);
        resetQuickTradeForm();
        onTradeSaved();
        setStatusMessage("Trade saved successfully.");
      } catch (submitError) {
        setError(submitError.message || "Failed to save trade.");
      } finally {
        setSavingQuickTrade(false);
      }
    },
    [
      filters.profileId,
      onTradeSaved,
      quickTradeForm,
      resetQuickTradeForm,
      pairOptions,
      sessionOptions,
      setupOptions,
      token,
      user?.activeProfileId,
    ]
  );

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

  const closedTrades = useMemo(
    () => mergedTrades.filter((trade) => String(trade?.automation?.status || "").toLowerCase() !== "open"),
    [mergedTrades]
  );

  const edgeInsights = useMemo(
    () =>
      buildEdgeInsights({
        trades: closedTrades,
        analytics: displayAnalytics,
        riskControls: user?.settings?.riskControls || {},
      }),
    [closedTrades, displayAnalytics, user?.settings?.riskControls]
  );

  const totalTrades = closedTrades.length;
  const totalWins = useMemo(
    () => closedTrades.filter((trade) => String(trade?.result || "").toLowerCase() === "win").length,
    [closedTrades]
  );
  const totalLosses = useMemo(
    () => closedTrades.filter((trade) => String(trade?.result || "").toLowerCase() === "loss").length,
    [closedTrades]
  );
  const totalBreakEven = Math.max(totalTrades - totalWins - totalLosses, 0);
  const overallWinRate = computeWinRate(closedTrades);
  const overallAvgRR = computeAverageRR(closedTrades);
  const expectancyValue = toNumber(edgeInsights.expectancy);
  const netRR = useMemo(
    () => round(closedTrades.reduce((sum, trade) => sum + toNumber(trade?.rrAchieved), 0), 2),
    [closedTrades]
  );

  const setupRankings = useMemo(() => groupedStats(closedTrades, (trade) => trade?.setupType), [closedTrades]);
  const sessionRankings = useMemo(() => groupedStats(closedTrades, (trade) => trade?.session), [closedTrades]);
  const emotionRankings = useMemo(() => groupedStats(closedTrades, (trade) => normalizeEmotion(trade?.notes?.emotionalState)), [closedTrades]);

  const followedPlanTrades = useMemo(
    () => closedTrades.filter((trade) => Boolean(trade?.tags?.cleanSetup)),
    [closedTrades]
  );
  const violatedPlanTrades = useMemo(
    () => closedTrades.filter((trade) => !trade?.tags?.cleanSetup),
    [closedTrades]
  );
  const followedPlanWinRate = computeWinRate(followedPlanTrades);
  const violatedPlanWinRate = computeWinRate(violatedPlanTrades);

  const equityCurvePoints = useMemo(() => {
    if (Array.isArray(displayAnalytics?.profitCurve) && displayAnalytics.profitCurve.length > 1) {
      return displayAnalytics.profitCurve.map((point, index) => ({
        x: index,
        y: toNumber(point?.cumulativeRR || point?.value || point?.rr),
        label: String(point?.label || point?.date || ""),
      }));
    }
    const chronologicalTrades = [...closedTrades].sort(
      (a, b) => new Date(a?.tradeDate || 0).getTime() - new Date(b?.tradeDate || 0).getTime()
    );
    let cumulative = 0;
    return chronologicalTrades.slice(-120).map((trade, index) => {
      cumulative += toNumber(trade?.rrAchieved);
      return {
        x: index,
        y: round(cumulative, 2),
        label: String(trade?.tradeDate || ""),
      };
    });
  }, [closedTrades, displayAnalytics?.profitCurve]);

  const weeklyTrades = useMemo(() => {
    const weekAgo = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return closedTrades.filter((trade) => new Date(trade?.tradeDate || 0).getTime() >= weekAgo);
  }, [closedTrades]);

  const monthlyTrades = useMemo(() => {
    const now = new Date();
    const month = now.getMonth();
    const year = now.getFullYear();
    return closedTrades.filter((trade) => {
      const date = new Date(trade?.tradeDate || 0);
      return date.getMonth() === month && date.getFullYear() === year;
    });
  }, [closedTrades]);

  const quarterlyTrades = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return closedTrades.filter((trade) => {
      const date = new Date(trade?.tradeDate || 0);
      return date.getTime() >= start.getTime() && date.getTime() <= now.getTime();
    });
  }, [closedTrades]);

  const recentTrades = useMemo(
    () =>
      [...closedTrades]
        .sort((a, b) => new Date(b?.tradeDate || 0).getTime() - new Date(a?.tradeDate || 0).getTime())
        .slice(0, 6),
    [closedTrades]
  );

  const activeMeta = pageMeta[activePage] || pageMeta.dashboard;
  const setupTop = setupRankings.slice(0, 6);
  const sessionTop = sessionRankings.slice(0, 3);
  const emotionTop = emotionRankings.filter((item) => item.label && item.label !== "Unknown").slice(0, 6);
  const weeklyWinRate = computeWinRate(weeklyTrades);
  const weeklyAvgRR = computeAverageRR(weeklyTrades);
  const monthlyWinRate = computeWinRate(monthlyTrades);
  const monthlyAvgRR = computeAverageRR(monthlyTrades);
  const quarterlyWinRate = computeWinRate(quarterlyTrades);
  const quarterlyAvgRR = computeAverageRR(quarterlyTrades);
  const monthLabel = new Date().toLocaleDateString([], { month: "long", year: "numeric" });
  const quarterLabel = useMemo(() => {
    const now = new Date();
    const start = new Date(now.getFullYear(), now.getMonth() - 2, 1);
    return `${start.toLocaleDateString([], { month: "short", year: "numeric" })} - ${now.toLocaleDateString([], {
      month: "short",
      year: "numeric",
    })}`;
  }, []);

  const equityPolyline = useMemo(() => {
    if (!equityCurvePoints.length) {
      return "0,120 360,120";
    }
    const values = equityCurvePoints.map((point) => point.y);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = Math.max(max - min, 0.01);
    const width = 640;
    const height = 260;
    return equityCurvePoints
      .map((point, index) => {
        const x = (index / Math.max(equityCurvePoints.length - 1, 1)) * width;
        const y = height - ((point.y - min) / range) * height;
        return `${round(x, 2)},${round(y, 2)}`;
      })
      .join(" ");
  }, [equityCurvePoints]);

  useEffect(() => {
    localStorage.setItem(PAGE_STORAGE_KEY, activePage);
  }, [activePage]);

  useEffect(() => {
    localStorage.setItem(ADVANCED_ANALYTICS_STORAGE_KEY, showAdvancedAnalytics ? "1" : "0");
  }, [showAdvancedAnalytics]);

  useEffect(() => {
    if (error) {
      pushToast("error", error);
    }
  }, [error, pushToast]);

  useEffect(() => {
    if (statusMessage) {
      pushToast("info", statusMessage);
    }
  }, [pushToast, statusMessage]);

  useEffect(() => {
    const onKeyDown = (event) => {
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
  }, []);

  if (sharedToken) {
    return <SharedWeeklyView shareToken={sharedToken} />;
  }

  if (urlRoute.path === "/verify-email") {
    return <VerifyEmailView token={urlRoute.urlToken} />;
  }

  if (urlRoute.path === "/reset-password") {
    return <ResetPasswordView initialToken={urlRoute.urlToken} />;
  }

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
    <main className="app-shell w-full min-h-screen p-0">
      <SaasWorkspace
        activePage={activePage}
        setActivePage={setActivePage}
        pages={PAGES}
        activeMeta={activeMeta}
        user={user}
        filters={filters}
        handleProfileSwitch={handleProfileSwitch}
        handleProfileCreate={handleProfileCreate}
        creatingProfile={creatingProfile}
        handleUpdateUserSettings={handleUpdateUserSettings}
        savingUserSettings={savingUserSettings}
        handleGenerateMt5BridgeKey={handleGenerateMt5BridgeKey}
        handleDisableMt5Bridge={handleDisableMt5Bridge}
        handleFetchTradeDetails={handleFetchTradeDetails}
        handleExportTradesCsv={handleExportTradesCsv}
        exportingCsv={exportingCsv}
        onLogout={onLogout}
        loading={loading}
        syncingQueue={syncingQueue}
        isOnline={isOnline}
        offlineQueue={offlineQueue}
        theme={theme}
        setTheme={setTheme}
        error={error}
        statusMessage={statusMessage}
        queueInsights={queueInsights}
        syncQueuedData={syncQueuedData}
        handleClearQueuedTrades={handleClearQueuedTrades}
        totalTrades={totalTrades}
        totalWins={totalWins}
        totalLosses={totalLosses}
        totalBreakEven={totalBreakEven}
        overallWinRate={overallWinRate}
        overallAvgRR={overallAvgRR}
        netRR={netRR}
        edgeInsights={edgeInsights}
        expectancyValue={expectancyValue}
        equityPolyline={equityPolyline}
        recentTrades={recentTrades}
        quickTradeForm={quickTradeForm}
        handleQuickTradeChange={handleQuickTradeChange}
        setupOptions={setupOptions}
        sessionOptions={sessionOptions}
        pairOptions={pairOptions}
        handleQuickTradeSubmit={handleQuickTradeSubmit}
        savingQuickTrade={savingQuickTrade}
        resetQuickTradeForm={resetQuickTradeForm}
        setupTop={setupTop}
        sessionTop={sessionTop}
        emotionTop={emotionTop}
        followedPlanTrades={followedPlanTrades}
        violatedPlanTrades={violatedPlanTrades}
        followedPlanWinRate={followedPlanWinRate}
        violatedPlanWinRate={violatedPlanWinRate}
        weeklyTrades={weeklyTrades}
        weeklyWinRate={weeklyWinRate}
        weeklyAvgRR={weeklyAvgRR}
        monthlyTrades={monthlyTrades}
        monthlyWinRate={monthlyWinRate}
        monthlyAvgRR={monthlyAvgRR}
        quarterlyTrades={quarterlyTrades}
        quarterlyWinRate={quarterlyWinRate}
        quarterlyAvgRR={quarterlyAvgRR}
        quarterLabel={quarterLabel}
        monthLabel={monthLabel}
        allTrades={closedTrades}
        reviewRange={reviewRange}
        setReviewRange={setReviewRange}
      />
      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </main>
  );

};

export default App;

