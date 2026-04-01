import { useEffect, useState } from "react";
import ThemeToggle from "./ThemeToggle";
import BrandLogo from "./BrandLogo";

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const computeWinRate = (trades = []) => {
  if (!Array.isArray(trades) || !trades.length) {
    return 0;
  }
  const wins = trades.filter((trade) => String(trade?.result || "").toLowerCase() === "win").length;
  return round((wins / trades.length) * 100, 1);
};

const computeAverageRR = (trades = []) => {
  if (!Array.isArray(trades) || !trades.length) {
    return 0;
  }
  const total = trades.reduce((sum, trade) => sum + toNumber(trade?.rrAchieved), 0);
  return round(total / trades.length, 2);
};

const normalizeEmotion = (value = "") =>
  String(value || "")
    .trim()
    .split(/[,\|/;]/)[0]
    .trim();

const groupedStats = (trades = [], selector = () => "") =>
  Object.values(
    (Array.isArray(trades) ? trades : []).reduce((acc, trade) => {
      const label = String(selector(trade) || "").trim();
      if (!label) {
        return acc;
      }
      if (!acc[label]) {
        acc[label] = { label, trades: 0, wins: 0, rr: 0 };
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

const computeMaxDrawdown = (trades = []) => {
  if (!Array.isArray(trades) || !trades.length) {
    return 0;
  }

  const chronological = [...trades].sort(
    (a, b) => new Date(a?.tradeDate || 0).getTime() - new Date(b?.tradeDate || 0).getTime()
  );
  let cumulative = 0;
  let peak = 0;
  let maxDrawdown = 0;

  for (const trade of chronological) {
    cumulative += toNumber(trade?.rrAchieved);
    peak = Math.max(peak, cumulative);
    maxDrawdown = Math.max(maxDrawdown, peak - cumulative);
  }

  return round(maxDrawdown, 2);
};

const formatTradeDate = (value) => {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString();
};

const TradeOutcome = ({ result = "" }) => {
  const normalizedResult = String(result || "BE").toLowerCase();
  const normalized = normalizedResult.includes("win")
    ? "win"
    : normalizedResult.includes("loss")
      ? "loss"
      : "be";
  return <span className={`saas-result saas-result-${normalized}`}>{result || "BE"}</span>;
};

const IconGlyph = ({ name = "dot" }) => {
  if (name === "dashboard") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="3" y="3" width="5" height="5" rx="1.2" />
        <rect x="12" y="3" width="5" height="5" rx="1.2" />
        <rect x="3" y="12" width="5" height="5" rx="1.2" />
        <rect x="12" y="12" width="5" height="5" rx="1.2" />
      </svg>
    );
  }
  if (name === "add-trade") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="7.2" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 6.5v7M6.5 10h7" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "analytics") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 15V6M9 15V9M14 15V4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <path d="M3 15.5h14" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "edge") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="6.7" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="10" cy="10" r="2.4" fill="none" stroke="currentColor" strokeWidth="1.6" />
      </svg>
    );
  }
  if (name === "behavior") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M7.2 6.2a2.8 2.8 0 1 1 4.4 2.2c-.6.4-.9.8-.9 1.5v.3" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
        <circle cx="10" cy="13.6" r="1.1" />
      </svg>
    );
  }
  if (name === "review") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="4" y="5" width="12" height="11" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7 3.8v2.2M13 3.8v2.2M7 9.5h6M7 12.5h4" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "settings") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="2.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path
          d="M10 4.2v1.4M10 14.4v1.4M4.2 10h1.4M14.4 10h1.4M5.8 5.8l1 1M13.2 13.2l1 1M14.2 5.8l-1 1M6.8 13.2l-1 1"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
      </svg>
    );
  }
  if (name === "pulse") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M2.5 10h4l1.6-3.2 3 7 1.8-4.3h4.6" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "win") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 13l4-4 3 2 5-5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "loss") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M4 7l4 4 3-2 5 5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
    );
  }
  if (name === "rr") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="5.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <circle cx="10" cy="10" r="1.6" />
      </svg>
    );
  }
  if (name === "money") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <path d="M10 4.2v11.6M12.8 7.2c0-1.3-1-2.2-2.8-2.2-1.8 0-2.8.9-2.8 2.1 0 3.3 5.6 1.5 5.6 4.7 0 1.3-1 2.2-2.8 2.2-1.8 0-2.8-.9-2.8-2.2" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "calendar") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <rect x="4" y="5" width="12" height="11" rx="1.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M7 3.8v2.2M13 3.8v2.2M6.7 9.5h6.6" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
      </svg>
    );
  }
  if (name === "warn") {
    return (
      <svg viewBox="0 0 20 20" aria-hidden="true">
        <circle cx="10" cy="10" r="6.5" fill="none" stroke="currentColor" strokeWidth="1.6" />
        <path d="M10 6.5v4.5M10 13.6v.1" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      </svg>
    );
  }
  return <span aria-hidden="true" className="saas-nav-dot" />;
};

const navIconMap = {
  dashboard: "dashboard",
  journal: "add-trade",
  analytics: "analytics",
  edge: "edge",
  behavior: "behavior",
  review: "review",
  settings: "settings",
};

const SaasWorkspace = ({
  activePage,
  setActivePage,
  pages,
  activeMeta,
  user,
  filters,
  handleProfileSwitch,
  onLogout,
  loading,
  syncingQueue,
  isOnline,
  offlineQueue,
  theme,
  setTheme,
  error,
  statusMessage,
  queueInsights,
  syncQueuedData,
  handleClearQueuedTrades,
  totalTrades,
  totalWins,
  totalLosses,
  totalBreakEven,
  overallWinRate,
  overallAvgRR,
  netRR,
  edgeInsights,
  expectancyValue,
  equityPolyline,
  recentTrades,
  quickTradeForm,
  handleQuickTradeChange,
  setupOptions,
  sessionOptions,
  handleQuickTradeSubmit,
  savingQuickTrade,
  resetQuickTradeForm,
  setupTop,
  sessionTop,
  emotionTop,
  followedPlanTrades,
  violatedPlanTrades,
  followedPlanWinRate,
  violatedPlanWinRate,
  weeklyTrades,
  weeklyWinRate,
  weeklyAvgRR,
  monthlyTrades,
  monthlyWinRate,
  monthlyAvgRR,
  quarterlyTrades,
  quarterlyWinRate,
  quarterlyAvgRR,
  quarterLabel,
  monthLabel,
  reviewRange,
  setReviewRange,
}) => {
  const reviewConfig = {
    week: {
      key: "week",
      tab: "This Week",
      title: "This Week's Performance",
      summaryTitle: "Weekly Highlights",
      trades: weeklyTrades,
      winRate: Number.isFinite(Number(weeklyWinRate)) ? weeklyWinRate : computeWinRate(weeklyTrades),
      avgRR: Number.isFinite(Number(weeklyAvgRR)) ? weeklyAvgRR : computeAverageRR(weeklyTrades),
      label: "This Week",
    },
    month: {
      key: "month",
      tab: "This Month",
      title: `${monthLabel} Summary`,
      summaryTitle: "Monthly Highlights",
      trades: monthlyTrades,
      winRate: Number.isFinite(Number(monthlyWinRate)) ? monthlyWinRate : computeWinRate(monthlyTrades),
      avgRR: Number.isFinite(Number(monthlyAvgRR)) ? monthlyAvgRR : computeAverageRR(monthlyTrades),
      label: monthLabel,
    },
    quarter: {
      key: "quarter",
      tab: "Last 3 Months",
      title: "Last 3 Months Summary",
      summaryTitle: "Quarterly Highlights",
      trades: quarterlyTrades,
      winRate: Number.isFinite(Number(quarterlyWinRate)) ? quarterlyWinRate : computeWinRate(quarterlyTrades),
      avgRR: Number.isFinite(Number(quarterlyAvgRR)) ? quarterlyAvgRR : computeAverageRR(quarterlyTrades),
      label: quarterLabel,
    },
  };
  const activeReview = reviewConfig[reviewRange] || reviewConfig.week;
  const activeReviewTrades = activeReview.trades || [];
  const activeReviewNetRR = round(activeReviewTrades.reduce((sum, trade) => sum + toNumber(trade?.rrAchieved), 0), 2);
  const activeBestTrade = [...activeReviewTrades].sort((a, b) => toNumber(b?.rrAchieved) - toNumber(a?.rrAchieved))[0] || null;
  const activeWorstTrade = [...activeReviewTrades].sort((a, b) => toNumber(a?.rrAchieved) - toNumber(b?.rrAchieved))[0] || null;
  const reviewSetupStats = groupedStats(activeReviewTrades, (trade) => trade?.setupType);
  const reviewSessionStats = groupedStats(activeReviewTrades, (trade) => trade?.session);
  const reviewEmotionStats = groupedStats(activeReviewTrades, (trade) => normalizeEmotion(trade?.notes?.emotionalState));
  const reviewBestSetup = reviewSetupStats[0] || null;
  const reviewWorstSetup = reviewSetupStats[reviewSetupStats.length - 1] || null;
  const reviewBestSession = reviewSessionStats[0] || null;
  const reviewWorstEmotion = reviewEmotionStats[reviewEmotionStats.length - 1] || null;
  const reviewMaxDrawdown = activeReviewTrades.length ? computeMaxDrawdown(activeReviewTrades) : 0;
  const reviewWorstHabit = reviewWorstSetup
    ? `${reviewWorstSetup.label} underperforming`
    : activeReviewTrades.length
      ? edgeInsights.worstHabit?.title || "No major leak detected"
      : "No closed trades in this period";
  const reviewWorstHabitDetail = reviewWorstSetup
    ? `${reviewWorstSetup.winRate}% win rate across ${reviewWorstSetup.trades} trades in ${activeReview.label.toLowerCase()}.`
    : activeReviewTrades.length
      ? edgeInsights.worstHabit?.detail || "Keep journaling with discipline."
      : "Log trades in this period to unlock focused review insights.";
  const reviewExpectancy = activeReviewTrades.length
    ? round(activeReviewTrades.reduce((sum, trade) => sum + toNumber(trade?.rrAchieved), 0) / activeReviewTrades.length, 2)
    : 0;
  const setupChartItems = setupTop.slice(0, 6);
  const sessionChartItems = sessionTop.slice(0, 6);
  const monthNetRR = round((monthlyTrades || []).reduce((sum, trade) => sum + toNumber(trade?.rrAchieved), 0), 2);
  const winShareLabel = totalTrades ? `${totalWins}/${totalTrades} wins` : "No trades yet";
  const mobilePrimaryPages = pages.filter((page) =>
    ["dashboard", "journal", "analytics", "edge", "behavior", "review", "settings"].includes(page.key)
  );
  const mobileLabelMap = {
    dashboard: "Dashboard",
    journal: "Add Trade",
    analytics: "Analytics",
    edge: "Edge",
    behavior: "Behavior",
    review: "Review",
    settings: "Settings",
  };
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    setMobileMenuOpen(false);
  }, [activePage]);

  useEffect(() => {
    if (!mobileMenuOpen) {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setMobileMenuOpen(false);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [mobileMenuOpen]);

  return (
  <section className="saas-shell app-journal">
    <aside className="saas-sidebar">
      <div className="saas-sidebar-main">
        <div className="saas-brand">
          <button
            type="button"
            className="saas-mobile-menu-btn"
            onClick={() => setMobileMenuOpen(true)}
            aria-label="Open navigation menu"
            aria-expanded={mobileMenuOpen}
            aria-controls="saas-mobile-drawer"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path d="M3.5 5.5h13M3.5 10h13M3.5 14.5h13" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
            </svg>
          </button>
          <BrandLogo className="brand-logo brand-logo-landing" />
          <span>TradeEdge</span>
        </div>
        <nav className="saas-nav">
          {pages.map((page) => (
            <button
              key={page.key}
              type="button"
              className={`saas-nav-item ${activePage === page.key ? "saas-nav-item-active" : ""}`}
              onClick={() => setActivePage(page.key)}
              aria-current={activePage === page.key ? "page" : undefined}
            >
              <span className="saas-nav-icon" aria-hidden="true">
                <IconGlyph name={navIconMap[page.key] || "dot"} />
              </span>
              {page.label}
            </button>
          ))}
        </nav>
      </div>

      <div className="saas-sidebar-footer">
        <select
          className="input saas-profile-select !h-9 !rounded-lg !py-1 text-xs"
          value={filters.profileId || user.activeProfileId || ""}
          onChange={(event) => handleProfileSwitch(event.target.value)}
        >
          {(user.profiles || []).map((profile) => (
            <option key={profile.id} value={profile.id}>
              {profile.name}
            </option>
          ))}
        </select>
        <button type="button" className="saas-signout" onClick={onLogout}>
          Sign Out
        </button>
      </div>
    </aside>

    <div
      className={`saas-mobile-drawer-backdrop ${mobileMenuOpen ? "saas-mobile-drawer-backdrop-open" : ""}`}
      onClick={() => setMobileMenuOpen(false)}
      aria-hidden={!mobileMenuOpen}
    >
      <aside
        id="saas-mobile-drawer"
        className={`saas-mobile-drawer ${mobileMenuOpen ? "saas-mobile-drawer-open" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Navigation menu"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="saas-mobile-drawer-head">
          <div className="saas-brand">
            <BrandLogo className="brand-logo brand-logo-landing" />
            <span>TradeEdge</span>
          </div>
          <button
            type="button"
            className="saas-mobile-drawer-close"
            onClick={() => setMobileMenuOpen(false)}
            aria-label="Close navigation menu"
          >
            <svg viewBox="0 0 20 20" aria-hidden="true">
              <path
                d="M6 6l8 8M14 6l-8 8"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.8"
                strokeLinecap="round"
              />
            </svg>
          </button>
        </div>
        <nav className="saas-mobile-drawer-nav">
          {mobilePrimaryPages.map((page) => (
            <button
              key={`drawer-${page.key}`}
              type="button"
              className={`saas-nav-item ${activePage === page.key ? "saas-nav-item-active" : ""}`}
              onClick={() => {
                setActivePage(page.key);
                setMobileMenuOpen(false);
              }}
              aria-current={activePage === page.key ? "page" : undefined}
            >
              <span className="saas-nav-icon" aria-hidden="true">
                <IconGlyph name={navIconMap[page.key] || "dot"} />
              </span>
              {mobileLabelMap[page.key] || page.label}
            </button>
          ))}
        </nav>
        <div className="saas-mobile-drawer-footer">
          <select
            className="input saas-profile-select !h-9 !rounded-lg !py-1 text-xs"
            value={filters.profileId || user.activeProfileId || ""}
            onChange={(event) => handleProfileSwitch(event.target.value)}
          >
            {(user.profiles || []).map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <button type="button" className="saas-signout" onClick={onLogout}>
            Sign Out
          </button>
        </div>
      </aside>
    </div>

    <section className="saas-content">
      {loading || syncingQueue ? <div className="top-loader" aria-hidden="true" /> : null}

      <header className="saas-page-header">
        <div>
          <h1>{activeMeta.title}</h1>
          <p>{activeMeta.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="chip text-textMain">{loading || syncingQueue ? "Syncing..." : isOnline ? "Online" : "Offline"}</span>
          {offlineQueue.length ? <span className="chip">{offlineQueue.length} queued</span> : null}
          <ThemeToggle
            theme={theme}
            onToggle={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
            className="!py-1"
          />
        </div>
      </header>

      {error ? (
        <p className="saas-alert saas-alert-error" role="alert" aria-live="assertive">
          {error}
        </p>
      ) : null}
      {statusMessage ? (
        <p className="saas-alert" role="status" aria-live="polite">
          {statusMessage}
        </p>
      ) : null}
      {queueInsights ? (
        <div className="saas-alert">
          Queue: {queueInsights.total} pending
          {queueInsights.failed ? ` | ${queueInsights.failed} need review` : ""}
          {queueInsights.waiting && queueInsights.nextRetryLabel ? ` | next retry ${queueInsights.nextRetryLabel}` : ""}
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

      {activePage === "dashboard" ? (
        <section className="space-y-4 saas-page-section saas-page-dashboard">
          <div className="saas-stats-grid saas-stats-grid-primary">
            <article className="panel saas-card">
              <div className="saas-stat-head">
                <span className="saas-stat-icon saas-stat-icon-blue">
                  <IconGlyph name="pulse" />
                </span>
                <p className="saas-stat-kicker">{totalTrades} closed</p>
              </div>
              <p className="saas-stat-value">{totalTrades}</p>
              <p className="saas-stat-label">Trades Logged</p>
            </article>
            <article className="panel saas-card">
              <div className="saas-stat-head">
                <span className="saas-stat-icon saas-stat-icon-green">
                  <IconGlyph name="win" />
                </span>
                <p className="saas-stat-kicker">{winShareLabel}</p>
              </div>
              <p className="saas-stat-value">{overallWinRate}%</p>
              <p className="saas-stat-label">Win Rate</p>
            </article>
            <article className="panel saas-card">
              <div className="saas-stat-head">
                <span className="saas-stat-icon saas-stat-icon-violet">
                  <IconGlyph name="rr" />
                </span>
                <p className="saas-stat-kicker">{`${netRR >= 0 ? "+" : ""}${netRR}R net`}</p>
              </div>
              <p className="saas-stat-value">{overallAvgRR}x</p>
              <p className="saas-stat-label">Risk:Reward</p>
            </article>
            <article className="panel saas-card saas-card-profit">
              <div className="saas-stat-head">
                <span className="saas-stat-icon saas-stat-icon-gold">
                  <IconGlyph name="money" />
                </span>
                <p className="saas-stat-kicker">Exp {round(expectancyValue, 2)}R</p>
              </div>
              <p className="saas-stat-value">
                {netRR >= 0 ? "+" : ""}{Math.abs(netRR).toFixed(2)}R
              </p>
              <p className="saas-stat-label">Net R</p>
            </article>
          </div>

          <article className="panel saas-edge-banner">
            <div className="saas-banner-head">
              <span className="saas-stat-icon saas-stat-icon-blue">
                <IconGlyph name="pulse" />
              </span>
              <h3>Edge Insights</h3>
            </div>
            {totalTrades ? (
              <p>
                Best session: <span>{edgeInsights.bestSession?.key || "N/A"}</span>
                {edgeInsights.bestSession?.winRate !== undefined ? (
                  <span> ({edgeInsights.bestSession.winRate}% WR)</span>
                ) : null}
                {edgeInsights.bestSetup?.key ? (
                  <>
                    . Best setup: <span>{edgeInsights.bestSetup.key}</span>.
                  </>
                ) : (
                  "."
                )}
              </p>
            ) : (
              <p>No closed trades yet. Log trades to unlock edge insights.</p>
            )}
            <button type="button" className="chip quick-chart-btn" onClick={() => setActivePage("edge")}>
              View Full Analysis
            </button>
          </article>

          <div className="saas-main-grid">
            <article className="panel saas-card">
              <h3 className="saas-card-title">Equity Curve</h3>
              <svg viewBox="0 0 640 260" className="saas-line-chart" aria-hidden="true">
                <polyline
                  points={equityPolyline}
                  fill="none"
                  stroke="#3b82f6"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            </article>

            <article className="panel saas-card">
              <h3 className="saas-card-title">Key Metrics</h3>
              <div className="saas-metric-list">
                <div className="saas-metric-item">
                  <span>Expectancy</span>
                  <strong>{round(expectancyValue, 2)}R</strong>
                </div>
                <div className="saas-progress saas-progress-blue">
                  <span style={{ width: `${Math.min(Math.max((expectancyValue + 1) * 45, 0), 100)}%` }} />
                </div>
                <div className="saas-metric-item">
                  <span>Max Drawdown</span>
                  <strong>{round(Math.abs(toNumber(edgeInsights.maxDrawdown)), 2)}R</strong>
                </div>
                <div className="saas-progress saas-progress-red">
                  <span style={{ width: `${Math.min(Math.max(Math.abs(toNumber(edgeInsights.maxDrawdown)) * 30, 0), 100)}%` }} />
                </div>
                <div className="saas-metric-item">
                  <span>Worst Habit</span>
                  <strong>{edgeInsights.worstHabit?.title || "None"}</strong>
                </div>
                {edgeInsights.worstHabit?.detail ? (
                  <p className="saas-metric-note">{edgeInsights.worstHabit.detail}</p>
                ) : null}
              </div>
              <button type="button" className="landing-cta-secondary !w-full" onClick={() => setActivePage("behavior")}>
                Behavior Analysis
              </button>
            </article>
          </div>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <h3 className="saas-card-title">Recent Trades</h3>
              <button type="button" className="chip quick-chart-btn" onClick={() => setActivePage("journal")}>
                Add Trade
              </button>
            </div>
            <div className="saas-table-wrap">
              <table className="saas-table" aria-describedby="recent-trades-caption">
                <caption id="recent-trades-caption" className="saas-sr-only">
                  Recent trades with date, pair, setup, risk reward ratio, outcome, and profit or loss.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Date</th>
                    <th scope="col">Pair</th>
                    <th scope="col">Setup</th>
                    <th scope="col">R:R</th>
                    <th scope="col">Outcome</th>
                    <th scope="col">Net R</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.map((trade) => (
                    <tr key={trade._id || `${trade.tradeDate}-${trade.pair}-${trade.setupType}`}>
                      <th scope="row">{formatTradeDate(trade.tradeDate)}</th>
                      <td data-label="Pair">{trade.pair || "-"}</td>
                      <td data-label="Setup">{trade.setupType || "-"}</td>
                      <td data-label="R:R">{toNumber(trade.rrAchieved).toFixed(1)}x</td>
                      <td data-label="Outcome">
                        <TradeOutcome result={trade.result} />
                      </td>
                      <td
                        data-label="Net R"
                        className={toNumber(trade.rrAchieved) >= 0 ? "saas-table-pnl-positive" : "saas-table-pnl-negative"}
                      >
                        {toNumber(trade.rrAchieved) >= 0 ? "+" : "-"}
                        {Math.abs(toNumber(trade.rrAchieved)).toFixed(2)}R
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activePage === "journal" ? (
        <section className="space-y-4">
          <button type="button" className="saas-back-link" onClick={() => setActivePage("dashboard")}>
            <span aria-hidden="true">&lt;</span> Back to Dashboard
          </button>
          <form className="panel saas-card saas-add-trade" onSubmit={handleQuickTradeSubmit}>
            <div className="saas-form-grid">
              <label>
                <span className="label">Date</span>
                <input
                  className="input"
                  type="date"
                  value={quickTradeForm.tradeDate}
                  onChange={(event) => handleQuickTradeChange("tradeDate", event.target.value)}
                  required
                />
              </label>
              <label>
                <span className="label">Currency Pair</span>
                <input
                  className="input"
                  value={quickTradeForm.pair}
                  onChange={(event) => handleQuickTradeChange("pair", event.target.value)}
                  placeholder="EUR/USD"
                  required
                />
              </label>
              <label>
                <span className="label">Entry Price</span>
                <input
                  className="input"
                  value={quickTradeForm.entryPrice}
                  onChange={(event) => handleQuickTradeChange("entryPrice", event.target.value)}
                  placeholder="1.0850"
                  required
                />
              </label>
              <label>
                <span className="label">Exit Price</span>
                <input
                  className="input"
                  value={quickTradeForm.exitPrice}
                  onChange={(event) => handleQuickTradeChange("exitPrice", event.target.value)}
                  placeholder="1.0920"
                />
              </label>
              <label>
                <span className="label">Risk:Reward Ratio</span>
                <input
                  className="input"
                  value={quickTradeForm.plannedRR}
                  onChange={(event) => handleQuickTradeChange("plannedRR", event.target.value)}
                  placeholder="2.5"
                />
              </label>
              <label>
                <span className="label">Setup</span>
                <select
                  className="input"
                  value={quickTradeForm.setupType}
                  onChange={(event) => handleQuickTradeChange("setupType", event.target.value)}
                >
                  {setupOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Trading Session</span>
                <select
                  className="input"
                  value={quickTradeForm.session}
                  onChange={(event) => handleQuickTradeChange("session", event.target.value)}
                >
                  {sessionOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                <span className="label">Emotion</span>
                <input
                  className="input"
                  value={quickTradeForm.emotion}
                  onChange={(event) => handleQuickTradeChange("emotion", event.target.value)}
                  placeholder="Confident"
                />
              </label>
            </div>

            <label className="saas-toggle-row">
              <span>
                <strong>Followed Trading Plan</strong>
                <small>Did you follow your rules?</small>
              </span>
              <input
                type="checkbox"
                checked={quickTradeForm.followedPlan}
                onChange={(event) => handleQuickTradeChange("followedPlan", event.target.checked)}
              />
            </label>

            <label>
              <span className="label">Trade Notes</span>
              <textarea
                className="input min-h-24"
                value={quickTradeForm.notes}
                onChange={(event) => handleQuickTradeChange("notes", event.target.value)}
                placeholder="What did you see? Why did you enter?"
              />
            </label>

            <div className="saas-form-actions">
              <button className="btn-primary" type="submit" disabled={savingQuickTrade}>
                {savingQuickTrade ? "Saving..." : "Save Trade"}
              </button>
              <button
                type="button"
                className="landing-cta-secondary"
                onClick={resetQuickTradeForm}
                disabled={savingQuickTrade}
              >
                Cancel
              </button>
            </div>
          </form>
        </section>
      ) : null}

      {activePage === "analytics" ? (
        <section className="space-y-4 saas-page-section saas-page-analytics">
          <div className="saas-stats-grid saas-stats-grid-primary">
            <article className="panel saas-card">
              <div className="saas-stat-head">
                <span className="saas-stat-icon saas-stat-icon-green">
                  <IconGlyph name="win" />
                </span>
                <p className="saas-stat-kicker">Wins</p>
              </div>
              <p className="saas-stat-value">{totalWins}</p>
              <p className="saas-stat-label">Winning Trades</p>
            </article>
            <article className="panel saas-card">
              <div className="saas-stat-head">
                <span className="saas-stat-icon saas-stat-icon-red">
                  <IconGlyph name="loss" />
                </span>
                <p className="saas-stat-kicker">Losses</p>
              </div>
              <p className="saas-stat-value">{totalLosses}</p>
              <p className="saas-stat-label">Losing Trades</p>
            </article>
            <article className="panel saas-card">
              <div className="saas-stat-head">
                <span className="saas-stat-icon saas-stat-icon-violet">
                  <IconGlyph name="rr" />
                </span>
                <p className="saas-stat-kicker">Expectancy</p>
              </div>
              <p className="saas-stat-value">{round(expectancyValue, 2)}R</p>
              <p className="saas-stat-label">Per Trade</p>
            </article>
            <article className="panel saas-card">
              <div className="saas-stat-head">
                <span className="saas-stat-icon saas-stat-icon-blue">
                  <IconGlyph name="pulse" />
                </span>
                <p className="saas-stat-kicker">Avg R:R</p>
              </div>
              <p className="saas-stat-value">{overallAvgRR}x</p>
              <p className="saas-stat-label">Risk:Reward</p>
            </article>
          </div>

          <div className="saas-main-grid">
            <article className="panel saas-card">
              <h3 className="saas-card-title">Performance by Setup</h3>
              <div className="saas-bars" style={{ "--saas-bars-columns": String(Math.max(setupChartItems.length, 1)) }}>
                {setupChartItems.map((item) => (
                  <div key={item.label} className="saas-bar-item">
                    <div className="saas-bar" style={{ height: `${Math.min(Math.max(item.winRate, 0), 100)}%` }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel saas-card">
              <h3 className="saas-card-title">Performance by Session</h3>
              <div className="saas-bars" style={{ "--saas-bars-columns": String(Math.max(sessionChartItems.length, 1)) }}>
                {sessionChartItems.map((item) => (
                  <div key={item.label} className="saas-bar-item">
                    <div className="saas-bar saas-bar-purple" style={{ height: `${Math.min(Math.max(item.winRate, 0), 100)}%` }} />
                    <span>{item.label}</span>
                  </div>
                ))}
              </div>
            </article>
          </div>

          <div className="saas-main-grid">
            <article className="panel saas-card">
              <h3 className="saas-card-title">Trade Outcomes</h3>
              <div
                className="saas-pie"
                style={{
                  background: `conic-gradient(#10b981 0 ${overallWinRate}%, #ef4444 ${overallWinRate}% ${
                    overallWinRate + (totalTrades ? (totalLosses / totalTrades) * 100 : 0)
                  }%, #475569 0 100%)`,
                }}
              />
              <div className="saas-pie-legend">
                <span>Wins {overallWinRate}%</span>
                <span>Losses {totalTrades ? round((totalLosses / totalTrades) * 100, 1) : 0}%</span>
                <span>Break-even {totalTrades ? round((totalBreakEven / totalTrades) * 100, 1) : 0}%</span>
              </div>
            </article>
            <article className="panel saas-card">
              <h3 className="saas-card-title">This Month</h3>
              <p className="saas-stat-value">
                {monthNetRR >= 0 ? "+" : "-"}
                {Math.abs(monthNetRR).toFixed(2)}R
              </p>
              <p className="saas-stat-label">Net R</p>
            </article>
          </div>
        </section>
      ) : null}

      {activePage === "edge" ? (
        <section className="space-y-4">
          <article className="panel saas-edge-banner saas-edge-banner-primary">
            <div className="saas-banner-head">
              <span className="saas-stat-icon saas-stat-icon-blue">
                <IconGlyph name="pulse" />
              </span>
              <h3>Your Trading Edge</h3>
            </div>
            <p>
              Best Setup: <span>{setupTop[0]?.label || "N/A"}</span> ({setupTop[0]?.winRate ?? 0}% WR)
              <span className="ml-3">Best Session: {sessionTop[0]?.label || "N/A"} ({sessionTop[0]?.winRate ?? 0}% WR)</span>
            </p>
          </article>

          <div className="saas-main-grid">
            <article className="panel saas-card">
              <h3 className="saas-card-title">Setup Rankings</h3>
              <div className="saas-ranking-list">
                {setupTop.map((item, index) => (
                  <div key={item.label} className="saas-ranking-item">
                    <div className="saas-ranking-top">
                      <div className="saas-rank-title">
                        <span className={`saas-rank-badge ${index < 3 ? "saas-rank-badge-top" : ""}`}>#{index + 1}</span>
                        <strong>{item.label}</strong>
                      </div>
                      <span className={`saas-rank-rate ${item.winRate < 40 ? "saas-rank-rate-low" : ""}`}>{item.winRate}%</span>
                    </div>
                    <div className="saas-ranking-sub">
                      <p>{item.trades} trades</p>
                      <p>
                        Avg R:R {toNumber(item.avgRR).toFixed(2)}x
                      </p>
                    </div>
                    <div className={`saas-progress ${item.winRate < 40 ? "saas-progress-muted" : "saas-progress-green"}`}>
                      <span style={{ width: `${Math.min(Math.max(item.winRate, 0), 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>
            <article className="panel saas-card">
              <h3 className="saas-card-title">Session Rankings</h3>
              <div className="saas-ranking-list">
                {sessionTop.map((item, index) => (
                  <div key={item.label} className="saas-ranking-item">
                    <div className="saas-ranking-top">
                      <div className="saas-rank-title">
                        <span className={`saas-rank-badge ${index < 3 ? "saas-rank-badge-top" : ""}`}>#{index + 1}</span>
                        <strong>{item.label}</strong>
                      </div>
                      <span className={`saas-rank-rate ${item.winRate < 40 ? "saas-rank-rate-low" : ""}`}>{item.winRate}%</span>
                    </div>
                    <div className="saas-ranking-sub">
                      <p>{item.trades} trades</p>
                      <p>
                        Avg R:R {toNumber(item.avgRR).toFixed(2)}x
                      </p>
                    </div>
                    <div className={`saas-progress ${item.winRate < 40 ? "saas-progress-muted" : "saas-progress-green"}`}>
                      <span style={{ width: `${Math.min(Math.max(item.winRate, 0), 100)}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </article>
          </div>
        </section>
      ) : null}

      {activePage === "behavior" ? (
        <section className="space-y-4">
          <article className="panel saas-behavior-banner">
            <div className="saas-banner-head">
              <span className="saas-stat-icon saas-stat-icon-gold">
                <IconGlyph name="behavior" />
              </span>
              <h3>Psychology Insight</h3>
            </div>
            <p>
              You win <span>{followedPlanWinRate}%</span> when following your plan, but only
              <span> {violatedPlanWinRate}%</span> when you don't.
            </p>
            <p>Discipline is your edge.</p>
          </article>

          <div className="saas-main-grid">
            <article className="panel saas-card">
              <h3 className="saas-card-title">Plan Adherence</h3>
              <div
                className="saas-pie"
                style={{
                  background: `conic-gradient(#10b981 0 ${
                    totalTrades ? (followedPlanTrades.length / totalTrades) * 100 : 0
                  }%, #ef4444 0 100%)`,
                }}
              />
              <div className="saas-behavior-summary">
                <div className="saas-behavior-mini saas-behavior-mini-good">
                  <p>Followed</p>
                  <strong>{followedPlanTrades.length}</strong>
                </div>
                <div className="saas-behavior-mini saas-behavior-mini-bad">
                  <p>Violated</p>
                  <strong>{violatedPlanTrades.length}</strong>
                </div>
              </div>
            </article>
            <article className="panel saas-card">
              <h3 className="saas-card-title">Impact on Win Rate</h3>
              <div className="saas-impact-chart">
                <div className="saas-impact-bars">
                  <div className="saas-impact-bar-item">
                    <div className="saas-impact-bar saas-impact-bar-good" style={{ height: `${Math.min(Math.max(followedPlanWinRate, 0), 100)}%` }} />
                    <span>Followed Plan</span>
                  </div>
                  <div className="saas-impact-bar-item">
                    <div className="saas-impact-bar saas-impact-bar-bad" style={{ height: `${Math.min(Math.max(violatedPlanWinRate, 0), 100)}%` }} />
                    <span>Violated Plan</span>
                  </div>
                </div>
              </div>
              <div className="saas-impact-values">
                <strong>{followedPlanWinRate}%</strong>
                <strong>{violatedPlanWinRate}%</strong>
              </div>
              <p className="saas-impact-note">
                {Math.max(round(followedPlanWinRate - violatedPlanWinRate, 1), 0)}% higher win rate when following your plan
              </p>
            </article>
          </div>

          <article className="panel saas-card">
            <h3 className="saas-card-title">Performance by Emotional State</h3>
            <div className="saas-emotion-grid">
              {emotionTop.map((item) => (
                <div
                  key={item.label}
                  className={`saas-emotion-item ${item.winRate >= 50 ? "saas-emotion-item-good" : "saas-emotion-item-bad"}`}
                >
                  <div className="flex items-center justify-between">
                    <strong>{item.label}</strong>
                    <span>{item.winRate}% WR</span>
                  </div>
                  <p>{item.trades} trades</p>
                  <div className={`saas-progress ${item.winRate >= 50 ? "saas-progress-green" : "saas-progress-muted"}`}>
                    <span style={{ width: `${Math.min(Math.max(item.winRate, 0), 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>
      ) : null}

      {activePage === "review" ? (
        <section className="space-y-4">
          <div className="saas-tabs">
            {Object.values(reviewConfig).map((tab) => (
              <button
                key={tab.key}
                type="button"
                className={`saas-tab ${reviewRange === tab.key ? "saas-tab-active" : ""}`}
                onClick={() => setReviewRange(tab.key)}
                aria-current={reviewRange === tab.key ? "page" : undefined}
              >
                {tab.tab}
              </button>
            ))}
          </div>

          <article className="panel saas-card">
            <div className="saas-section-header">
              <span className="saas-stat-icon saas-stat-icon-blue">
                <IconGlyph name="calendar" />
              </span>
              <h3 className="saas-card-title">{activeReview.title}</h3>
            </div>
            <div className="saas-stats-grid">
              <article className="saas-mini-stat"><p>Total Trades</p><strong>{activeReviewTrades.length}</strong></article>
              <article className="saas-mini-stat"><p>Win Rate</p><strong>{activeReview.winRate}%</strong></article>
              <article className="saas-mini-stat"><p>Avg R:R</p><strong>{activeReview.avgRR}x</strong></article>
              <article className="saas-mini-stat saas-mini-stat-profit"><p>Net R</p><strong>{activeReviewNetRR >= 0 ? "+" : "-"}{Math.abs(activeReviewNetRR).toFixed(2)}R</strong></article>
            </div>
            {!activeReviewTrades.length ? (
              <p className="saas-stat-label mt-3">No closed trades in {activeReview.label.toLowerCase()} yet.</p>
            ) : null}

            <div className="saas-main-grid mt-4">
              <div className="saas-note-card">
                <h4>{activeReview.summaryTitle}</h4>
                <ul className="saas-note-list">
                  <li>
                    <span className="saas-list-icon saas-list-icon-green">
                      <IconGlyph name="win" />
                    </span>
                    <span>
                      <strong>Best Setup</strong>
                      <small>
                        {reviewBestSetup
                          ? `${reviewBestSetup.label} with ${reviewBestSetup.winRate}% win rate`
                          : "No setup performance data in this range yet"}
                      </small>
                    </span>
                  </li>
                  <li>
                    <span className="saas-list-icon saas-list-icon-violet">
                      <IconGlyph name="rr" />
                    </span>
                    <span>
                      <strong>Best Session</strong>
                      <small>
                        {reviewBestSession
                          ? `${reviewBestSession.label} session performing at ${reviewBestSession.winRate}%`
                          : "No session performance data in this range yet"}
                      </small>
                    </span>
                  </li>
                  <li>
                    <span className="saas-list-icon saas-list-icon-blue">
                      <IconGlyph name="money" />
                    </span>
                    <span>
                      <strong>Expectancy</strong>
                      <small>{reviewExpectancy.toFixed(2)}R per trade ({activeReview.label})</small>
                    </span>
                  </li>
                </ul>
              </div>
              <div className="saas-note-card">
                <h4>Areas to Improve</h4>
                <ul className="saas-note-list">
                  <li>
                    <span className="saas-list-icon saas-list-icon-red">
                      <IconGlyph name="warn" />
                    </span>
                    <span>
                      <strong>{reviewWorstHabit}</strong>
                      <small>{reviewWorstHabitDetail}</small>
                    </span>
                  </li>
                  <li>
                    <span className="saas-list-icon saas-list-icon-gold">
                      <IconGlyph name="money" />
                    </span>
                    <span>
                      <strong>Max Drawdown</strong>
                      <small>{reviewMaxDrawdown.toFixed(2)}R peak-to-trough over {activeReview.label.toLowerCase()}</small>
                    </span>
                  </li>
                  {reviewWorstEmotion ? (
                    <li>
                      <span className="saas-list-icon saas-list-icon-red">
                        <IconGlyph name="behavior" />
                      </span>
                      <span>
                        <strong>Weakest Emotion Context</strong>
                        <small>{reviewWorstEmotion.label}: {reviewWorstEmotion.winRate}% win rate ({reviewWorstEmotion.trades} trades)</small>
                      </span>
                    </li>
                  ) : null}
                </ul>
              </div>
            </div>
          </article>

          <article className="panel saas-card">
            <h3 className="saas-card-title">Trade Breakdown</h3>

            <div className="saas-main-grid mt-4">
              <div className="saas-note-card saas-best-trade">
                <div className="saas-section-header">
                  <span className="saas-stat-icon saas-stat-icon-green">
                    <IconGlyph name="win" />
                  </span>
                  <h4>Best Trade</h4>
                </div>
                <ul className="saas-detail-list">
                  <li><span>Pair</span><strong>{activeBestTrade?.pair || "-"}</strong></li>
                  <li><span>Setup</span><strong>{activeBestTrade?.setupType || "-"}</strong></li>
                  <li><span>R:R</span><strong>{activeBestTrade ? `${toNumber(activeBestTrade.rrAchieved).toFixed(1)}x` : "-"}</strong></li>
                  <li><span>Date</span><strong>{formatTradeDate(activeBestTrade?.tradeDate)}</strong></li>
                </ul>
              </div>
              <div className="saas-note-card saas-worst-trade">
                <div className="saas-section-header">
                  <span className="saas-stat-icon saas-stat-icon-red">
                    <IconGlyph name="loss" />
                  </span>
                  <h4>Worst Trade</h4>
                </div>
                <ul className="saas-detail-list">
                  <li><span>Pair</span><strong>{activeWorstTrade?.pair || "-"}</strong></li>
                  <li><span>Setup</span><strong>{activeWorstTrade?.setupType || "-"}</strong></li>
                  <li><span>R:R</span><strong>{activeWorstTrade ? `${toNumber(activeWorstTrade.rrAchieved).toFixed(1)}x` : "-"}</strong></li>
                  <li><span>Date</span><strong>{formatTradeDate(activeWorstTrade?.tradeDate)}</strong></li>
                </ul>
              </div>
            </div>
          </article>
        </section>
      ) : null}

      {activePage === "settings" ? (
        <section className="space-y-4 saas-page-section saas-page-settings">
          <article className="panel saas-card">
            <h3 className="saas-card-title">Workspace Settings</h3>
            <div className="saas-settings-grid">
              <label>
                <span className="label">Active Profile</span>
                <select
                  className="input"
                  value={filters.profileId || user.activeProfileId || ""}
                  onChange={(event) => handleProfileSwitch(event.target.value)}
                >
                  {(user.profiles || []).map((profile) => (
                    <option key={profile.id} value={profile.id}>
                      {profile.name}
                    </option>
                  ))}
                </select>
              </label>
              <div className="saas-settings-theme-row">
                <span className="label">Theme</span>
                <ThemeToggle
                  theme={theme}
                  onToggle={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
                />
              </div>
            </div>
          </article>
          <article className="panel saas-card">
            <h3 className="saas-card-title">Queue & Session</h3>
            <div className="saas-settings-actions">
              <button
                type="button"
                className="btn-primary"
                onClick={() => syncQueuedData(true)}
                disabled={!isOnline || syncingQueue}
              >
                {syncingQueue ? "Syncing..." : "Sync Queue"}
              </button>
              <button type="button" className="landing-cta-secondary" onClick={onLogout}>
                Sign Out
              </button>
            </div>
          </article>
        </section>
      ) : null}
    </section>
  </section>
  );
};

export default SaasWorkspace;
