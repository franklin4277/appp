import { lazy, Suspense, useEffect, useMemo, useState, useCallback } from "react";
import {
  createWeeklyReviewShare,
  listWeeklyReviewShares,
  revokeWeeklyReviewShare,
} from "../api/tradesApi";
import ThemeToggle from "./ThemeToggle";
import BrandLogo from "./BrandLogo";
import { PAIRS } from "../utils/options";

const ScreenshotReplay = lazy(() => import("./ScreenshotReplay"));
const AiCoachPanel = lazy(() => import("./AiCoachPanel"));

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toFinite = (value) => {
  if (value === undefined || value === null || value === "") {
    return Number.NaN;
  }
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : Number.NaN;
};

const round = (value, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const LazyPanelFallback = ({ message = "Loading..." }) => (
  <div className="panel saas-card">
    <p className="saas-stat-label">{message}</p>
  </div>
);

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

const computePlannedRR = ({ entryPrice, stopLoss, takeProfit }) => {
  const entry = toFinite(entryPrice);
  const stop = toFinite(stopLoss);
  const take = toFinite(takeProfit);
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(take)) {
    return 0;
  }
  const risk = Math.abs(entry - stop);
  if (!risk) {
    return 0;
  }
  return round(Math.abs(take - entry) / risk, 2);
};

const computeAccountPerformance = (trades = [], startingBalance = 0) => {
  const baseBalance = Number(startingBalance);
  if (!Number.isFinite(baseBalance) || baseBalance <= 0) {
    return null;
  }

  const chronological = [...(Array.isArray(trades) ? trades : [])].sort(
    (a, b) => new Date(a?.tradeDate || 0).getTime() - new Date(b?.tradeDate || 0).getTime()
  );

  let equity = baseBalance;
  let peak = baseBalance;
  let maxDrawdownAmount = 0;
  let maxDrawdownPercent = 0;
  let trackedTrades = 0;
  let cumulativeRiskPercent = 0;

  chronological.forEach((trade) => {
    const riskPercent = Math.max(toNumber(trade?.riskPercent, 0), 0);
    const rrAchieved = toNumber(trade?.rrAchieved, 0);
    if (!riskPercent) {
      return;
    }

    trackedTrades += 1;
    cumulativeRiskPercent += riskPercent;
    const pnl = equity * (riskPercent / 100) * rrAchieved;
    equity += pnl;
    peak = Math.max(peak, equity);
    const drawdownAmount = peak - equity;
    const drawdownPercent = peak > 0 ? (drawdownAmount / peak) * 100 : 0;
    maxDrawdownAmount = Math.max(maxDrawdownAmount, drawdownAmount);
    maxDrawdownPercent = Math.max(maxDrawdownPercent, drawdownPercent);
  });

  return {
    startingBalance: round(baseBalance, 2),
    currentBalance: round(equity, 2),
    pnlAmount: round(equity - baseBalance, 2),
    returnPercent: round(((equity - baseBalance) / baseBalance) * 100, 2),
    maxDrawdownAmount: round(maxDrawdownAmount, 2),
    maxDrawdownPercent: round(maxDrawdownPercent, 2),
    trackedTrades,
    avgRiskPercent: trackedTrades ? round(cumulativeRiskPercent / trackedTrades, 2) : 0,
  };
};

const computeLotSize = ({ accountBalance, riskPercent, entryPrice, stopLoss, pair }) => {
  const balance = Number(accountBalance);
  const risk = Number(riskPercent);
  const entry = Number(entryPrice);
  const stop = Number(stopLoss);
  if (!Number.isFinite(balance) || balance <= 0 || !Number.isFinite(risk) || risk <= 0) {
    return 0;
  }
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || entry === stop) {
    return 0;
  }

  const pipMultiplier = String(pair || "").toUpperCase().endsWith("JPY") ? 100 : 10000;
  const stopPips = Math.abs(entry - stop) * pipMultiplier;
  if (!Number.isFinite(stopPips) || stopPips <= 0) {
    return 0;
  }

  const riskAmount = balance * (risk / 100);
  const lots = riskAmount / (stopPips * 10);
  return round(lots, 2);
};

const confidenceForSample = (count = 0) => {
  const trades = Number(count) || 0;
  if (trades >= 12) {
    return { label: "High confidence", tone: "good" };
  }
  if (trades >= 6) {
    return { label: "Building confidence", tone: "muted" };
  }
  return { label: "Low sample size", tone: "warn" };
};

const gradeFromScore = (score = 0) => {
  if (score >= 90) return "A";
  if (score >= 80) return "B";
  if (score >= 70) return "C";
  return "D";
};

const buildAccountTimeline = (trades = [], startingBalance = 0) => {
  const baseBalance = Number(startingBalance);
  if (!Number.isFinite(baseBalance) || baseBalance <= 0) {
    return { points: [], impactByTradeId: new Map() };
  }

  const chronological = [...(Array.isArray(trades) ? trades : [])].sort(
    (a, b) => new Date(a?.tradeDate || 0).getTime() - new Date(b?.tradeDate || 0).getTime()
  );
  let balance = baseBalance;
  const points = [{ x: 0, y: round(baseBalance, 2), label: "Start" }];
  const impactByTradeId = new Map();

  chronological.forEach((trade, index) => {
    const riskPercent = Math.max(toNumber(trade?.riskPercent, 0), 0);
    const rrAchieved = toNumber(trade?.rrAchieved, 0);
    const balanceBefore = balance;
    const riskAmount = round(balanceBefore * (riskPercent / 100), 2);
    const pnlAmount = round(riskAmount * rrAchieved, 2);
    const balanceAfter = round(balanceBefore + pnlAmount, 2);
    const pnlPercent = balanceBefore > 0 ? round((pnlAmount / balanceBefore) * 100, 2) : 0;
    balance = balanceAfter;

    const tradeId = String(trade?._id || trade?.clientTradeId || `${trade?.tradeDate || index}-${index}`);
    impactByTradeId.set(tradeId, {
      balanceBefore,
      balanceAfter,
      riskAmount,
      pnlAmount,
      pnlPercent,
      riskPercent: round(riskPercent, 2),
    });
    points.push({
      x: index + 1,
      y: balanceAfter,
      label: String(trade?.tradeDate || trade?.createdAt || ""),
    });
  });

  return { points, impactByTradeId };
};

const buildPolyline = (points = [], { width = 640, height = 260 } = {}) => {
  if (!Array.isArray(points) || points.length <= 1) {
    return `0,${height} ${width},${height}`;
  }
  const values = points.map((point) => toNumber(point?.y));
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = Math.max(max - min, 0.01);

  return points
    .map((point, index) => {
      const x = (index / Math.max(points.length - 1, 1)) * width;
      const y = height - ((toNumber(point?.y) - min) / range) * height;
      return `${round(x, 2)},${round(y, 2)}`;
    })
    .join(" ");
};

const buildTradeJournalLabels = ({ trade, maxRiskPerTradePercent = 0, impact = null }) => {
  const labels = [];
  const riskPercent = Math.max(toNumber(trade?.riskPercent, 0), 0);
  const plannedRR = toNumber(trade?.plannedRR, 0);

  if (trade?.tags?.cleanSetup && !trade?.ruleBreakReason) {
    labels.push("A+ setup");
  }
  if (trade?.ruleBreakReason) {
    labels.push("Rule override");
  }
  if (maxRiskPerTradePercent > 0 && riskPercent > maxRiskPerTradePercent) {
    labels.push("Over-risk");
  } else if (riskPercent > 0 && maxRiskPerTradePercent > 0 && riskPercent >= maxRiskPerTradePercent * 0.85) {
    labels.push("Near max risk");
  }
  if (!trade?.screenshots?.before && !trade?.screenshots?.after) {
    labels.push("No screenshots");
  }
  if (plannedRR >= 2) {
    labels.push("2R+ plan");
  }
  if (impact && impact.pnlAmount > 0) {
    labels.push("Account growth");
  }
  return labels.slice(0, 6);
};

const buildReviewScores = ({
  trades = [],
  screenshotCoverage = 0,
  maxRiskPerTradePercent = 0,
}) => {
  if (!Array.isArray(trades) || !trades.length) {
    return {
      discipline: 0,
      riskControl: 0,
      execution: 0,
      overall: 0,
      grade: "D",
    };
  }

  const cleanTrades = trades.filter((trade) => trade?.tags?.cleanSetup).length;
  const noOverrideTrades = trades.filter((trade) => !String(trade?.ruleBreakReason || "").trim()).length;
  const underRiskTrades =
    maxRiskPerTradePercent > 0
      ? trades.filter((trade) => Math.max(toNumber(trade?.riskPercent, 0), 0) <= maxRiskPerTradePercent).length
      : trades.length;
  const notesCompleteTrades = trades.filter(
    (trade) =>
      String(trade?.notes?.executionReview || "").trim() ||
      String(trade?.notes?.priceAction || "").trim() ||
      String(trade?.notes?.emotionalState || "").trim()
  ).length;
  const strongPlanTrades = trades.filter((trade) => toNumber(trade?.plannedRR, 0) >= 1.5).length;

  const discipline = round((cleanTrades / trades.length) * 60 + (noOverrideTrades / trades.length) * 40, 1);
  const riskControl = round((underRiskTrades / trades.length) * 70 + Math.min(screenshotCoverage, 100) * 0.3, 1);
  const execution = round(
    (notesCompleteTrades / trades.length) * 40 +
      (strongPlanTrades / trades.length) * 30 +
      Math.min(screenshotCoverage, 100) * 0.3,
    1
  );
  const overall = round((discipline + riskControl + execution) / 3, 1);

  return {
    discipline,
    riskControl,
    execution,
    overall,
    grade: gradeFromScore(overall),
  };
};

const buildMistakeStats = (trades = []) =>
  Object.values(
    (Array.isArray(trades) ? trades : []).reduce((acc, trade) => {
      const tags = Array.isArray(trade?.mistakeTags) ? trade.mistakeTags : [];
      tags.forEach((tag) => {
        const label = String(tag || "").trim();
        if (!label) {
          return;
        }
        if (!acc[label]) {
          acc[label] = { label, trades: 0, losses: 0, netRR: 0 };
        }
        acc[label].trades += 1;
        if (toNumber(trade?.rrAchieved) < 0) {
          acc[label].losses += 1;
        }
        acc[label].netRR += toNumber(trade?.rrAchieved);
      });
      return acc;
    }, {})
  )
    .map((item) => ({
      ...item,
      netRR: round(item.netRR, 2),
      costRR: round(Math.abs(Math.min(item.netRR, 0)), 2),
    }))
    .sort((a, b) => b.costRR - a.costRR || b.trades - a.trades);

const buildCalendarDays = (trades = []) => {
  const byDay = new Map();
  (Array.isArray(trades) ? trades : []).forEach((trade) => {
    const date = new Date(trade?.tradeDate || 0);
    if (Number.isNaN(date.getTime())) {
      return;
    }
    const key = date.toISOString().slice(0, 10);
    const current = byDay.get(key) || { key, trades: 0, netRR: 0, wins: 0, losses: 0 };
    current.trades += 1;
    current.netRR += toNumber(trade?.rrAchieved);
    if (String(trade?.result || "").toLowerCase() === "win") {
      current.wins += 1;
    } else if (String(trade?.result || "").toLowerCase() === "loss") {
      current.losses += 1;
    }
    byDay.set(key, current);
  });
  return [...byDay.values()]
    .map((item) => ({ ...item, netRR: round(item.netRR, 2) }))
    .sort((a, b) => b.key.localeCompare(a.key));
};

const buildCoachingSummary = ({
  trades = [],
  mistakeStats = [],
  bestSetup = null,
  bestSession = null,
  screenshotCoverage = 0,
}) => {
  if (!Array.isArray(trades) || !trades.length) {
    return {
      keep: ["Log 3-5 clean trades so Journex can coach from real data."],
      stop: ["Avoid rushing into review conclusions before you have enough sample size."],
      test: ["Capture screenshots and notes on every trade this week."],
      assistant: "Once you build a sample, Journex will turn your review into a clearer weekly coaching brief.",
    };
  }

  const followedPlanCount = trades.filter((trade) => trade?.tags?.cleanSetup).length;
  const ruleBreakCount = trades.filter((trade) => String(trade?.ruleBreakReason || "").trim()).length;
  const keep = [];
  const stop = [];
  const test = [];

  if (bestSetup) {
    keep.push(`Keep leaning into ${bestSetup.label}; it is your strongest setup in this range.`);
  }
  if (bestSession) {
    keep.push(`Prioritize ${bestSession.label} when you want your cleanest decision-making window.`);
  }
  if (followedPlanCount > 0) {
    keep.push(`Your cleaner trades are giving you structure. Preserve that routine.`);
  }
  if (mistakeStats[0]) {
    stop.push(`Stop leaking R into ${mistakeStats[0].label}; it has cost ${mistakeStats[0].costRR}R so far.`);
  }
  if (ruleBreakCount > 0) {
    stop.push(`Cut down rule overrides. ${ruleBreakCount} trade${ruleBreakCount === 1 ? "" : "s"} needed an override reason.`);
  }
  if (screenshotCoverage < 80) {
    test.push("Raise screenshot coverage so your replay and review stay visual, not just memory-based.");
  }
  if (bestSetup) {
    test.push(`Run a focused block of ${bestSetup.label} trades and compare them against your weaker setups.`);
  }
  if (bestSession) {
    test.push(`Protect ${bestSession.label} as a priority session and trade lighter outside it.`);
  }

  return {
    keep: keep.slice(0, 3),
    stop: stop.slice(0, 3),
    test: test.slice(0, 3),
    assistant:
      screenshotCoverage >= 80
        ? "Replay quality is strong enough now to make your weekly review much more actionable."
        : "Your review is improving, but more screenshots and tighter notes will make the coaching sharper.",
  };
};

const formatCurrency = (value) => {
  const amount = Number(value);
  if (!Number.isFinite(amount)) {
    return "-";
  }
  return amount.toLocaleString(undefined, {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 2,
  });
};

const formatTradeDate = (value) => {
  const date = new Date(value || Date.now());
  if (Number.isNaN(date.getTime())) {
    return "-";
  }
  return date.toLocaleDateString();
};

const formatDateTime = (value = "") => {
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
  coaching: "behavior",
  playbooks: "edge",
  risk: "warn",
  settings: "settings",
  "trade-detail": "analytics",
};

const SaasWorkspace = ({
  token,
  activePage,
  setActivePage,
  pages,
  activeMeta,
  user,
  filters,
  handleProfileSwitch,
  handleProfileCreate,
  handleProfileUpdate,
  handleProfileDelete,
  creatingProfile,
  savingProfile,
  handleUpdateUserSettings,
  savingUserSettings,
  handleGenerateMt5BridgeKey,
  handleDisableMt5Bridge,
  handleFetchTradeDetails,
  handleExportTradesCsv,
  exportingCsv,
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
  applyRecentTradeDefaults,
  pairOptions,
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
  allTrades,
  reviewRange,
  setReviewRange,
  onNotify,
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
    all: {
      key: "all",
      tab: "All Time",
      title: "All Time Summary",
      summaryTitle: "Long-Term Highlights",
      trades: allTrades,
      winRate: computeWinRate(allTrades),
      avgRR: computeAverageRR(allTrades),
      label: "All Time",
    },
  };
  const activeReview = reviewConfig[reviewRange] || reviewConfig.week;
  const activeReviewTrades = activeReview.trades || [];
  const resolvedEdgeInsights =
    edgeInsights && typeof edgeInsights === "object"
      ? {
          bestSession: null,
          bestSetup: null,
          worstHabit: null,
          notifications: [],
          equityNow: 0,
          maxDrawdown: 0,
          ...edgeInsights,
        }
      : {
          bestSession: null,
          bestSetup: null,
          worstHabit: null,
          notifications: [],
          equityNow: 0,
          maxDrawdown: 0,
        };
  if (!Array.isArray(resolvedEdgeInsights.notifications)) {
    resolvedEdgeInsights.notifications = [];
  }
  const resolvedSetupTop = Array.isArray(setupTop) ? setupTop : [];
  const resolvedSessionTop = Array.isArray(sessionTop) ? sessionTop : [];
  const resolvedEmotionTop = Array.isArray(emotionTop) ? emotionTop : [];
  const resolvedFollowedPlanTrades = Array.isArray(followedPlanTrades) ? followedPlanTrades : [];
  const resolvedViolatedPlanTrades = Array.isArray(violatedPlanTrades) ? violatedPlanTrades : [];
  const [tradeSearch, setTradeSearch] = useState("");
  const sortedReviewTrades = useMemo(() => {
    return [...activeReviewTrades].sort(
      (a, b) => new Date(b?.tradeDate || 0).getTime() - new Date(a?.tradeDate || 0).getTime()
    );
  }, [activeReviewTrades]);
  const filteredReviewTrades = useMemo(() => {
    const query = String(tradeSearch || "").trim().toLowerCase();
    if (!query) {
      return sortedReviewTrades;
    }
    return sortedReviewTrades.filter((trade) => {
      const haystack = [
        trade?.pair,
        trade?.session,
        trade?.setupType,
        trade?.playbookName,
        trade?.tradeType,
        trade?.result,
        trade?.ruleBreakReason,
        trade?.notes?.emotionalState,
        ...(Array.isArray(trade?.mistakeTags) ? trade.mistakeTags : []),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [sortedReviewTrades, tradeSearch]);
  const activeReviewNetRR = round(activeReviewTrades.reduce((sum, trade) => sum + toNumber(trade?.rrAchieved), 0), 2);
  const activeBestTrade = [...activeReviewTrades].sort((a, b) => toNumber(b?.rrAchieved) - toNumber(a?.rrAchieved))[0] || null;
  const activeWorstTrade = [...activeReviewTrades].sort((a, b) => toNumber(a?.rrAchieved) - toNumber(b?.rrAchieved))[0] || null;
  const reviewSetupStats = groupedStats(activeReviewTrades, (trade) => trade?.setupType);
  const reviewSessionStats = groupedStats(activeReviewTrades, (trade) => trade?.session);
  const reviewEmotionStats = groupedStats(activeReviewTrades, (trade) => normalizeEmotion(trade?.notes?.emotionalState));
  const pairRankings = groupedStats(allTrades, (trade) => trade?.pair);
  const reviewBestSetup = reviewSetupStats[0] || null;
  const reviewWorstSetup = reviewSetupStats[reviewSetupStats.length - 1] || null;
  const reviewBestSession = reviewSessionStats[0] || null;
  const reviewWorstEmotion = reviewEmotionStats[reviewEmotionStats.length - 1] || null;
  const reviewMaxDrawdown = activeReviewTrades.length ? computeMaxDrawdown(activeReviewTrades) : 0;
  const reviewWorstHabit = reviewWorstSetup
    ? `${reviewWorstSetup.label} underperforming`
    : activeReviewTrades.length
      ? resolvedEdgeInsights.worstHabit?.title || "No major leak detected"
      : "No closed trades in this period";
  const reviewWorstHabitDetail = reviewWorstSetup
    ? `${reviewWorstSetup.winRate}% win rate across ${reviewWorstSetup.trades} trades in ${activeReview.label.toLowerCase()}.`
    : activeReviewTrades.length
      ? resolvedEdgeInsights.worstHabit?.detail || "Keep journaling with discipline."
      : "Log trades in this period to unlock focused review insights.";
  const reviewExpectancy = activeReviewTrades.length
    ? round(activeReviewTrades.reduce((sum, trade) => sum + toNumber(trade?.rrAchieved), 0) / activeReviewTrades.length, 2)
    : 0;
  const reviewTradesWithScreenshots = activeReviewTrades.filter(
    (trade) => Boolean(trade?.screenshots?.before || trade?.screenshots?.after)
  ).length;
  const reviewScreenshotCoverage = activeReviewTrades.length
    ? round((reviewTradesWithScreenshots / activeReviewTrades.length) * 100, 1)
    : 0;
  const setupChartItems = resolvedSetupTop.slice(0, 6);
  const sessionChartItems = resolvedSessionTop.slice(0, 6);
  const monthNetRR = round((monthlyTrades || []).reduce((sum, trade) => sum + toNumber(trade?.rrAchieved), 0), 2);
  const winShareLabel = totalTrades ? `${totalWins}/${totalTrades} wins` : "No trades yet";
  const navPages = pages.filter((page) => page.nav !== false);
  const mobilePrimaryPages = navPages.filter((page) => page.mobile !== false);
  const mobileLabelMap = {
    dashboard: "Dashboard",
    journal: "Add Trade",
    analytics: "Analytics",
    review: "Review",
    coaching: "Coaching",
    playbooks: "Playbooks",
    risk: "Risk",
    settings: "Settings",
  };
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileAccountSize, setNewProfileAccountSize] = useState("");
  const [playbookImportText, setPlaybookImportText] = useState("[]");
  const [playbookDraft, setPlaybookDraft] = useState({
    name: "",
    setupType: "",
    targetSession: "",
    confirmations: "",
    checklist: "",
    notes: "",
  });
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [tradeDetailReturnPage, setTradeDetailReturnPage] = useState("review");
  const [tradeReplayOpen, setTradeReplayOpen] = useState(false);
  const [reviewReplayTarget, setReviewReplayTarget] = useState("");
  const [tradeDetailsBusy, setTradeDetailsBusy] = useState(false);
  const [tradeDetailsError, setTradeDetailsError] = useState("");
  const [settingsDraft, setSettingsDraft] = useState({
    profileName: "",
    profileDescription: "",
    pairs: "",
    sessions: "",
    setupTypes: "",
    playbooks: [],
    mistakeTags: "",
    fundedModeEnabled: false,
    fundedProvider: "",
    fundedProfitTargetPercent: 8,
    fundedMaxTotalDrawdownPercent: 10,
    fundedConsistencyPercent: 25,
    fundedMinTradingDays: 5,
    requireRuleAlignment: true,
    maxTradesPerSession: 4,
    cooldownMinutesAfterLoss: 30,
    stopForDayLossRR: 3,
    maxRiskPerTradePercent: 1,
    dailyProfitTargetPercent: 1.5,
    weeklyProfitTargetPercent: 4,
    maxDailyDrawdownPercent: 2,
    strictChecklistGate: false,
    accountSize: "",
  });
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeKey, setBridgeKey] = useState("");
  const [bridgeLabel, setBridgeLabel] = useState(() => user?.integrations?.mt5?.label || "MT5 Bridge");
  const [bridgeMessage, setBridgeMessage] = useState("");
  const [bridgeError, setBridgeError] = useState("");
  const [shareBusy, setShareBusy] = useState(false);
  const [shareError, setShareError] = useState("");
  const [shareMessage, setShareMessage] = useState("");
  const [reviewShares, setReviewShares] = useState([]);
  const [loadingReviewShares, setLoadingReviewShares] = useState(false);
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState(null);
  const [showPlaybookBuilder, setShowPlaybookBuilder] = useState(false);
  const activePageInfo = pages.find((page) => page.key === activePage) || null;
  const returnPageInfo = pages.find((page) => page.key === tradeDetailReturnPage) || null;
  const activeGroup = activePage === "trade-detail" ? returnPageInfo?.group || "Review" : activePageInfo?.group || "Core";
  const groupPages = navPages.filter((page) => page.group === activeGroup);
  const breadcrumbItems =
    activePage === "trade-detail"
      ? [activePageInfo?.group || "Review", returnPageInfo?.label || "Review", activeMeta.title]
      : [activePageInfo?.group || "Core", activeMeta.title];
  const userInitials = useMemo(() => {
    const base = String(user?.name || user?.email || "J").trim();
    const parts = base.split(/\s+/).filter(Boolean);
    const initials = parts.slice(0, 2).map((part) => part[0]?.toUpperCase()).join("");
    return initials || "J";
  }, [user?.email, user?.name]);

  const notify = useCallback(
    (type, message) => {
      if (typeof onNotify === "function") {
        onNotify(type, message);
      }
    },
    [onNotify]
  );

  useEffect(() => {
    const resolvedActiveProfile =
      (user?.profiles || []).find((profile) => profile.id === (user?.activeProfileId || "main")) || null;
    const toCsv = (value = []) => (Array.isArray(value) ? value.join(", ") : "");
    const playbooks = Array.isArray(user?.settings?.playbooks) ? user.settings.playbooks : [];
    const safePlaybooks = playbooks.length
      ? playbooks
      : [
          {
            id: "main-playbook",
            name: "Main Playbook",
            setupType: "",
            targetSession: "",
            confirmations: [],
            invalidations: [],
            checklist: [],
            notes: "",
          },
        ];
    setSettingsDraft({
      profileName: resolvedActiveProfile?.name || "",
      profileDescription: resolvedActiveProfile?.description || "",
      pairs: toCsv(user?.settings?.options?.pairs || []),
      sessions: toCsv(user?.settings?.options?.sessions || []),
      setupTypes: toCsv(user?.settings?.options?.setupTypes || []),
      playbooks: safePlaybooks,
      mistakeTags: toCsv(user?.settings?.reviewToolkit?.mistakeTags || []),
      fundedModeEnabled: Boolean(user?.settings?.reviewToolkit?.fundedMode?.enabled),
      fundedProvider: user?.settings?.reviewToolkit?.fundedMode?.provider || "",
      fundedProfitTargetPercent: user?.settings?.reviewToolkit?.fundedMode?.profitTargetPercent ?? 8,
      fundedMaxTotalDrawdownPercent: user?.settings?.reviewToolkit?.fundedMode?.maxTotalDrawdownPercent ?? 10,
      fundedConsistencyPercent: user?.settings?.reviewToolkit?.fundedMode?.consistencyPercent ?? 25,
      fundedMinTradingDays: user?.settings?.reviewToolkit?.fundedMode?.minTradingDays ?? 5,
      requireRuleAlignment: Boolean(user?.settings?.riskControls?.requireRuleAlignment ?? true),
      maxTradesPerSession: user?.settings?.riskControls?.maxTradesPerSession ?? 4,
      cooldownMinutesAfterLoss: user?.settings?.riskControls?.cooldownMinutesAfterLoss ?? 30,
      stopForDayLossRR: user?.settings?.riskControls?.stopForDayLossRR ?? 3,
      maxRiskPerTradePercent: user?.settings?.riskControls?.maxRiskPerTradePercent ?? 1,
      dailyProfitTargetPercent: user?.settings?.riskControls?.dailyProfitTargetPercent ?? 1.5,
      weeklyProfitTargetPercent: user?.settings?.riskControls?.weeklyProfitTargetPercent ?? 4,
      maxDailyDrawdownPercent: user?.settings?.riskControls?.maxDailyDrawdownPercent ?? 2,
      strictChecklistGate: Boolean(user?.settings?.riskControls?.strictChecklistGate),
      accountSize: resolvedActiveProfile?.accountSize ?? 0,
    });
    setPlaybookImportText(JSON.stringify(safePlaybooks, null, 2));
    setPlaybookDraft({
      name: "",
      setupType: resolvedActiveProfile?.setupType || "",
      targetSession: "",
      confirmations: "",
      checklist: "",
      notes: "",
    });
  }, [user]);

  const activeProfile = useMemo(
    () => (user?.profiles || []).find((profile) => profile.id === (filters.profileId || user?.activeProfileId)),
    [filters.profileId, user?.activeProfileId, user?.profiles]
  );
  const activeProfileAccountSize = Math.max(Number(activeProfile?.accountSize || 0), 0);
  const maxRiskPerTradePercent = Math.max(Number(user?.settings?.riskControls?.maxRiskPerTradePercent || 0), 0);
  const dailyProfitTargetPercent = Math.max(Number(user?.settings?.riskControls?.dailyProfitTargetPercent || 0), 0);
  const weeklyProfitTargetPercent = Math.max(Number(user?.settings?.riskControls?.weeklyProfitTargetPercent || 0), 0);
  const maxDailyDrawdownPercent = Math.max(Number(user?.settings?.riskControls?.maxDailyDrawdownPercent || 0), 0);
  const showSettingsPreview = activePage === "settings" || activePage === "risk";
  const previewProfileName = String(settingsDraft.profileName || "").trim() || activeProfile?.name || "Workspace";
  const previewProfileDescription = String(settingsDraft.profileDescription || "").trim() || activeProfile?.description || "";
  const previewAccountSize = showSettingsPreview ? Math.max(Number(settingsDraft.accountSize || 0), 0) : activeProfileAccountSize;
  const previewMaxRiskPerTradePercent = showSettingsPreview
    ? Math.max(Number(settingsDraft.maxRiskPerTradePercent || 0), 0)
    : maxRiskPerTradePercent;
  const previewDailyProfitTargetPercent = showSettingsPreview
    ? Math.max(Number(settingsDraft.dailyProfitTargetPercent || 0), 0)
    : dailyProfitTargetPercent;
  const previewWeeklyProfitTargetPercent = showSettingsPreview
    ? Math.max(Number(settingsDraft.weeklyProfitTargetPercent || 0), 0)
    : weeklyProfitTargetPercent;
  const previewMaxDailyDrawdownPercent = showSettingsPreview
    ? Math.max(Number(settingsDraft.maxDailyDrawdownPercent || 0), 0)
    : maxDailyDrawdownPercent;
  const activeAccountPerformance = useMemo(
    () => computeAccountPerformance(allTrades, activeProfileAccountSize),
    [activeProfileAccountSize, allTrades]
  );
  const accountTimeline = useMemo(
    () => buildAccountTimeline(allTrades, activeProfileAccountSize),
    [activeProfileAccountSize, allTrades]
  );
  const previewAccountPerformance = useMemo(
    () => computeAccountPerformance(allTrades, previewAccountSize),
    [allTrades, previewAccountSize]
  );
  const previewAccountTimeline = useMemo(
    () => buildAccountTimeline(allTrades, previewAccountSize),
    [allTrades, previewAccountSize]
  );
  const accountImpactByTradeId = accountTimeline.impactByTradeId;
  const accountBalancePolyline = useMemo(() => buildPolyline(accountTimeline.points), [accountTimeline.points]);
  const previewAccountBalancePolyline = useMemo(
    () => buildPolyline(previewAccountTimeline.points),
    [previewAccountTimeline.points]
  );
  const todayStart = useMemo(() => {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    return now.getTime();
  }, []);
  const dailyTrades = useMemo(
    () => allTrades.filter((trade) => new Date(trade?.tradeDate || 0).getTime() >= todayStart),
    [allTrades, todayStart]
  );
  const dailyAccountPerformance = useMemo(
    () => computeAccountPerformance(dailyTrades, activeProfileAccountSize),
    [activeProfileAccountSize, dailyTrades]
  );
  const weeklyAccountPerformance = useMemo(
    () => computeAccountPerformance(weeklyTrades, activeProfileAccountSize),
    [activeProfileAccountSize, weeklyTrades]
  );
  const previewDailyAccountPerformance = useMemo(
    () => computeAccountPerformance(dailyTrades, previewAccountSize),
    [dailyTrades, previewAccountSize]
  );
  const previewWeeklyAccountPerformance = useMemo(
    () => computeAccountPerformance(weeklyTrades, previewAccountSize),
    [previewAccountSize, weeklyTrades]
  );
  const quickTradeRiskSnapshot = useMemo(() => {
    const riskPercent = Math.max(toNumber(quickTradeForm?.riskPercent, 0), 0);
    const entryPrice = toFinite(quickTradeForm?.entryPrice);
    const defaultStop = Number.isFinite(entryPrice) ? round(entryPrice * 0.995, 5) : Number.NaN;
    const defaultTake = Number.isFinite(entryPrice) ? round(entryPrice * 1.01, 5) : Number.NaN;
    const stopLoss = Number.isFinite(toFinite(quickTradeForm?.stopLoss))
      ? toFinite(quickTradeForm?.stopLoss)
      : defaultStop;
    const takeProfit = Number.isFinite(toFinite(quickTradeForm?.takeProfit))
      ? toFinite(quickTradeForm?.takeProfit)
      : defaultTake;
    const plannedRR = quickTradeForm?.plannedRR
      ? Math.max(toNumber(quickTradeForm.plannedRR, 0), 0)
      : computePlannedRR({ entryPrice, stopLoss, takeProfit });
    const riskAmount = activeProfileAccountSize > 0 ? round(activeProfileAccountSize * (riskPercent / 100), 2) : 0;
    const projectedRewardAmount = riskAmount > 0 && plannedRR > 0 ? round(riskAmount * plannedRR, 2) : 0;
    const suggestedLotSize = computeLotSize({
      accountBalance: activeProfileAccountSize,
      riskPercent,
      entryPrice,
      stopLoss,
      pair: quickTradeForm?.pair,
    });
    const isOverMaxRisk = maxRiskPerTradePercent > 0 && riskPercent > maxRiskPerTradePercent;
    const isNearMaxRisk =
      !isOverMaxRisk &&
      maxRiskPerTradePercent > 0 &&
      riskPercent > 0 &&
      riskPercent >= maxRiskPerTradePercent * 0.85;

    return {
      riskPercent: round(riskPercent, 2),
      plannedRR: round(plannedRR, 2),
      riskAmount,
      projectedRewardAmount,
      suggestedLotSize,
      isOverMaxRisk,
      isNearMaxRisk,
      hasAccountSize: activeProfileAccountSize > 0,
    };
  }, [activeProfileAccountSize, maxRiskPerTradePercent, quickTradeForm]);
  const playbooks = useMemo(
    () => (Array.isArray(user?.settings?.playbooks) ? user.settings.playbooks : []),
    [user?.settings?.playbooks]
  );
  const draftPlaybooks = useMemo(
    () => (Array.isArray(settingsDraft.playbooks) ? settingsDraft.playbooks : []),
    [settingsDraft.playbooks]
  );
  const selectedPlaybook = useMemo(
    () => playbooks.find((playbook) => String(playbook?.id || "") === String(quickTradeForm.playbookId || "")) || null,
    [playbooks, quickTradeForm.playbookId]
  );
  const mistakeCatalog = useMemo(
    () => (Array.isArray(user?.settings?.reviewToolkit?.mistakeTags) ? user.settings.reviewToolkit.mistakeTags : []),
    [user?.settings?.reviewToolkit?.mistakeTags]
  );
  const fundedMode = useMemo(
    () => ({
      enabled: Boolean(user?.settings?.reviewToolkit?.fundedMode?.enabled),
      provider: String(user?.settings?.reviewToolkit?.fundedMode?.provider || ""),
      profitTargetPercent: Math.max(Number(user?.settings?.reviewToolkit?.fundedMode?.profitTargetPercent || 0), 0),
      maxTotalDrawdownPercent: Math.max(
        Number(user?.settings?.reviewToolkit?.fundedMode?.maxTotalDrawdownPercent || 0),
        0
      ),
      consistencyPercent: Math.max(Number(user?.settings?.reviewToolkit?.fundedMode?.consistencyPercent || 0), 0),
      minTradingDays: Math.max(Number(user?.settings?.reviewToolkit?.fundedMode?.minTradingDays || 0), 0),
    }),
    [user?.settings?.reviewToolkit?.fundedMode]
  );
  const playbookStats = useMemo(
    () => groupedStats(allTrades, (trade) => trade?.playbookName || trade?.playbookId),
    [allTrades]
  );
  const mistakeStats = useMemo(() => buildMistakeStats(allTrades), [allTrades]);
  const reviewMistakeStats = useMemo(() => buildMistakeStats(activeReviewTrades), [activeReviewTrades]);
  const reviewCalendarDays = useMemo(() => buildCalendarDays(activeReviewTrades), [activeReviewTrades]);
  const replayTrades = useMemo(
    () =>
      [...activeReviewTrades].sort(
        (a, b) => new Date(a?.tradeDate || 0).getTime() - new Date(b?.tradeDate || 0).getTime()
      ),
    [activeReviewTrades]
  );
  const replayTradeIndex = useMemo(
    () => replayTrades.findIndex((trade) => String(trade?._id || "") === String(reviewReplayTarget || "")),
    [replayTrades, reviewReplayTarget]
  );
  const replayTrade = replayTradeIndex >= 0 ? replayTrades[replayTradeIndex] : replayTrades[0] || null;
  const fundedProgress = useMemo(() => {
    if (!fundedMode.enabled || !activeAccountPerformance || !activeProfileAccountSize) {
      return null;
    }
    const totalDrawdownUsed = Math.max(activeAccountPerformance.maxDrawdownPercent, 0);
    const profitProgress = fundedMode.profitTargetPercent
      ? Math.min(Math.max((activeAccountPerformance.returnPercent / fundedMode.profitTargetPercent) * 100, 0), 100)
      : 0;
    const drawdownProgress = fundedMode.maxTotalDrawdownPercent
      ? Math.min(Math.max((totalDrawdownUsed / fundedMode.maxTotalDrawdownPercent) * 100, 0), 100)
      : 0;
    const tradingDays = new Set(
      allTrades.map((trade) => String(trade?.tradeDate || "").slice(0, 10)).filter(Boolean)
    ).size;
    return {
      tradingDays,
      passedDays: fundedMode.minTradingDays > 0 ? tradingDays >= fundedMode.minTradingDays : true,
      profitProgress,
      drawdownProgress,
      targetReached: fundedMode.profitTargetPercent > 0 && activeAccountPerformance.returnPercent >= fundedMode.profitTargetPercent,
      drawdownBreached:
        fundedMode.maxTotalDrawdownPercent > 0 && totalDrawdownUsed >= fundedMode.maxTotalDrawdownPercent,
    };
  }, [activeAccountPerformance, activeProfileAccountSize, allTrades, fundedMode]);
  const topSetupConfidence = confidenceForSample(resolvedSetupTop[0]?.trades || 0);
  const topSessionConfidence = confidenceForSample(resolvedSessionTop[0]?.trades || 0);
  const reviewScores = useMemo(
    () =>
      buildReviewScores({
        trades: activeReviewTrades,
        screenshotCoverage: reviewScreenshotCoverage,
        maxRiskPerTradePercent,
      }),
    [activeReviewTrades, maxRiskPerTradePercent, reviewScreenshotCoverage]
  );
  const selectedTradeImpact = useMemo(() => {
    if (!selectedTrade) {
      return null;
    }
    const key = String(selectedTrade?._id || selectedTrade?.clientTradeId || "");
    return accountImpactByTradeId.get(key) || null;
  }, [accountImpactByTradeId, selectedTrade]);
  const selectedTradeJournalLabels = useMemo(
    () =>
      selectedTrade
        ? buildTradeJournalLabels({
            trade: selectedTrade,
            maxRiskPerTradePercent,
            impact: selectedTradeImpact,
          })
        : [],
    [maxRiskPerTradePercent, selectedTrade, selectedTradeImpact]
  );
  const coachingSummary = useMemo(
    () =>
      buildCoachingSummary({
        trades: activeReviewTrades,
        mistakeStats: reviewMistakeStats,
        bestSetup: reviewBestSetup,
        bestSession: reviewBestSession,
        screenshotCoverage: reviewScreenshotCoverage,
      }),
    [
      activeReviewTrades,
      reviewBestSession,
      reviewBestSetup,
      reviewMistakeStats,
      reviewScreenshotCoverage,
    ]
  );
  const aiCoachContext = useMemo(
    () => ({
      user: {
        name: user?.name || "",
        email: user?.email || "",
        emailVerified: Boolean(user?.emailVerified),
      },
      profile: {
        name: activeProfile?.name || previewProfileName,
        description: activeProfile?.description || previewProfileDescription,
        accountSize: activeProfileAccountSize || null,
      },
      workspace: {
        currentPage: activePage,
        canChangeRulesByChat: true,
        supportedRuleChanges: [
          "max risk per trade",
          "daily profit target",
          "weekly profit target",
          "max daily drawdown",
        ],
      },
      overview: {
        totalTrades,
        totalWins,
        totalLosses,
        totalBreakEven,
        overallWinRate,
        overallAvgRR,
        netRR,
        expectancyValue: round(expectancyValue, 2),
      },
      review: {
        range: activeReview.label,
        trades: activeReviewTrades.length,
        winRate: activeReview.winRate,
        averageRR: activeReview.avgRR,
        netRR: activeReviewNetRR,
        screenshotCoverage: reviewScreenshotCoverage,
        bestSetup: reviewBestSetup,
        bestSession: reviewBestSession,
        topMistake: reviewMistakeStats[0] || null,
        scores: reviewScores,
        coaching: coachingSummary,
      },
      risk: {
        maxRiskPerTradePercent,
        dailyProfitTargetPercent,
        weeklyProfitTargetPercent,
        maxDailyDrawdownPercent,
        fundedMode,
      },
      rules: {
        riskControls: user?.settings?.riskControls || {},
        fundedMode: user?.settings?.reviewToolkit?.fundedMode || {},
      },
      topPatterns: {
        setups: resolvedSetupTop.slice(0, 3),
        sessions: resolvedSessionTop.slice(0, 3),
        emotions: Array.isArray(emotionTop) ? emotionTop.slice(0, 3) : [],
        playbooks: playbookStats.slice(0, 3),
      },
      playbooks: {
        saved: playbooks.slice(0, 8).map((playbook) => ({
          id: playbook?.id || "",
          name: playbook?.name || "",
          setupType: playbook?.setupType || "",
          targetSession: playbook?.targetSession || "",
          confirmations: Array.isArray(playbook?.confirmations) ? playbook.confirmations.slice(0, 4) : [],
          checklist: Array.isArray(playbook?.checklist) ? playbook.checklist.slice(0, 4) : [],
          notes: playbook?.notes || "",
        })),
      },
      recentTrades: (recentTrades || []).slice(0, 6).map((trade) => ({
        id: trade?._id || trade?.clientTradeId || "",
        date: trade?.tradeDate || trade?.createdAt || "",
        pair: trade?.pair || "",
        session: trade?.session || "",
        tradeType: trade?.tradeType || "",
        setupType: trade?.setupType || "",
        result: trade?.result || "",
        rrAchieved: toNumber(trade?.rrAchieved),
        screenshots: {
          before: trade?.screenshots?.before || "",
          after: trade?.screenshots?.after || "",
        },
        notes: String(trade?.notes?.executionReview || trade?.notes?.priceAction || "").trim(),
      })),
      screenshotTrades: activeReviewTrades
        .filter((trade) => trade?.screenshots?.before || trade?.screenshots?.after)
        .slice(0, 8)
        .map((trade) => ({
          id: trade?._id || trade?.clientTradeId || "",
          date: trade?.tradeDate || trade?.createdAt || "",
          pair: trade?.pair || "",
          session: trade?.session || "",
          setupType: trade?.setupType || "",
          result: trade?.result || "",
          before: trade?.screenshots?.before || "",
          after: trade?.screenshots?.after || "",
        })),
      selectedTrade: selectedTrade
        ? {
            id: selectedTrade?._id || selectedTrade?.clientTradeId || "",
            pair: selectedTrade?.pair || "",
            tradeType: selectedTrade?.tradeType || "",
            session: selectedTrade?.session || "",
            setupType: selectedTrade?.setupType || "",
            result: selectedTrade?.result || "",
            rrAchieved: toNumber(selectedTrade?.rrAchieved),
            notes: selectedTrade?.notes || {},
            screenshots: {
              before: selectedTrade?.screenshots?.before || "",
              after: selectedTrade?.screenshots?.after || "",
            },
          }
        : null,
    }),
    [
      activePage,
      activeProfile?.description,
      activeProfile?.name,
      activeProfileAccountSize,
      activeReview.avgRR,
      activeReview.label,
      activeReview.winRate,
      activeReviewNetRR,
      activeReviewTrades.length,
      coachingSummary,
      dailyProfitTargetPercent,
      emotionTop,
      expectancyValue,
      fundedMode,
      maxDailyDrawdownPercent,
      maxRiskPerTradePercent,
      netRR,
      overallAvgRR,
      overallWinRate,
      playbooks,
      playbookStats,
      previewProfileDescription,
      previewProfileName,
      recentTrades,
      resolvedSessionTop,
      resolvedSetupTop,
      selectedTrade,
      user?.email,
      user?.emailVerified,
      user?.name,
      user?.settings?.reviewToolkit?.fundedMode,
      user?.settings?.riskControls,
      reviewBestSession,
      reviewBestSetup,
      activeReviewTrades,
      reviewMistakeStats,
      reviewScores,
      reviewScreenshotCoverage,
      sessionTop,
      totalBreakEven,
      totalLosses,
      totalTrades,
      totalWins,
      weeklyProfitTargetPercent,
    ]
  );
  const dailyGoalProgress = useMemo(() => {
    if (!dailyAccountPerformance || dailyProfitTargetPercent <= 0) {
      return null;
    }
    return {
      targetPercent: dailyProfitTargetPercent,
      currentPercent: dailyAccountPerformance.returnPercent,
      progressPercent: Math.min(Math.max((dailyAccountPerformance.returnPercent / dailyProfitTargetPercent) * 100, 0), 100),
    };
  }, [dailyAccountPerformance, dailyProfitTargetPercent]);
  const weeklyGoalProgress = useMemo(() => {
    if (!weeklyAccountPerformance || weeklyProfitTargetPercent <= 0) {
      return null;
    }
    return {
      targetPercent: weeklyProfitTargetPercent,
      currentPercent: weeklyAccountPerformance.returnPercent,
      progressPercent: Math.min(Math.max((weeklyAccountPerformance.returnPercent / weeklyProfitTargetPercent) * 100, 0), 100),
    };
  }, [weeklyAccountPerformance, weeklyProfitTargetPercent]);
  const dailyDrawdownProgress = useMemo(() => {
    if (!dailyAccountPerformance || maxDailyDrawdownPercent <= 0) {
      return null;
    }
    const drawdownPercent = Math.max(-dailyAccountPerformance.returnPercent, 0);
    return {
      capPercent: maxDailyDrawdownPercent,
      currentPercent: drawdownPercent,
      usedPercent: drawdownPercent,
      progressPercent: Math.min(Math.max((drawdownPercent / maxDailyDrawdownPercent) * 100, 0), 100),
      breached: drawdownPercent >= maxDailyDrawdownPercent,
    };
  }, [dailyAccountPerformance, maxDailyDrawdownPercent]);
  const previewDailyGoalProgress = useMemo(() => {
    if (!previewDailyAccountPerformance || previewDailyProfitTargetPercent <= 0) {
      return null;
    }
    return {
      targetPercent: previewDailyProfitTargetPercent,
      currentPercent: previewDailyAccountPerformance.returnPercent,
      progressPercent: Math.min(
        Math.max((previewDailyAccountPerformance.returnPercent / previewDailyProfitTargetPercent) * 100, 0),
        100
      ),
    };
  }, [previewDailyAccountPerformance, previewDailyProfitTargetPercent]);
  const previewWeeklyGoalProgress = useMemo(() => {
    if (!previewWeeklyAccountPerformance || previewWeeklyProfitTargetPercent <= 0) {
      return null;
    }
    return {
      targetPercent: previewWeeklyProfitTargetPercent,
      currentPercent: previewWeeklyAccountPerformance.returnPercent,
      progressPercent: Math.min(
        Math.max((previewWeeklyAccountPerformance.returnPercent / previewWeeklyProfitTargetPercent) * 100, 0),
        100
      ),
    };
  }, [previewWeeklyAccountPerformance, previewWeeklyProfitTargetPercent]);
  const previewDailyDrawdownProgress = useMemo(() => {
    if (!previewDailyAccountPerformance || previewMaxDailyDrawdownPercent <= 0) {
      return null;
    }
    const drawdownPercent = Math.max(-previewDailyAccountPerformance.returnPercent, 0);
    return {
      capPercent: previewMaxDailyDrawdownPercent,
      currentPercent: drawdownPercent,
      usedPercent: drawdownPercent,
      progressPercent: Math.min(Math.max((drawdownPercent / previewMaxDailyDrawdownPercent) * 100, 0), 100),
      breached: drawdownPercent >= previewMaxDailyDrawdownPercent,
    };
  }, [previewDailyAccountPerformance, previewMaxDailyDrawdownPercent]);
  const analyticsMetricBars = useMemo(
    () => [
      {
        label: "Expectancy",
        valueLabel: `${round(expectancyValue, 2)}R`,
        fillPercent: Math.min(Math.max((toNumber(expectancyValue) + 2) * 25, 6), 100),
        tone: "blue",
      },
      {
        label: "Equity",
        valueLabel: `${toNumber(resolvedEdgeInsights?.equityNow) >= 0 ? "+" : "-"}${Math.abs(toNumber(resolvedEdgeInsights?.equityNow)).toFixed(2)}R`,
        fillPercent: Math.min(Math.max(Math.abs(toNumber(resolvedEdgeInsights?.equityNow)) * 22, 6), 100),
        tone: toNumber(resolvedEdgeInsights?.equityNow) >= 0 ? "green" : "slate",
      },
      {
        label: "Drawdown",
        valueLabel: `-${Math.abs(toNumber(resolvedEdgeInsights?.maxDrawdown)).toFixed(2)}R`,
        fillPercent: Math.min(Math.max(Math.abs(toNumber(resolvedEdgeInsights?.maxDrawdown)) * 30, 6), 100),
        tone: "red",
      },
    ],
    [expectancyValue, resolvedEdgeInsights?.equityNow, resolvedEdgeInsights?.maxDrawdown]
  );
  const setupPerformanceRows = useMemo(
    () => groupedStats(allTrades, (trade) => trade?.setupType),
    [allTrades]
  );
  const sessionPerformanceRows = useMemo(
    () => groupedStats(allTrades, (trade) => trade?.session),
    [allTrades]
  );
  const drawdownTimelinePoints = useMemo(() => {
    if (!Array.isArray(allTrades) || !allTrades.length) {
      return [];
    }
    const chronological = [...allTrades].sort(
      (a, b) => new Date(a?.tradeDate || 0).getTime() - new Date(b?.tradeDate || 0).getTime()
    );
    let cumulative = 0;
    let peak = 0;
    return chronological.map((trade, index) => {
      cumulative += toNumber(trade?.rrAchieved, 0);
      peak = Math.max(peak, cumulative);
      return {
        x: index + 1,
        y: round(cumulative - peak, 2),
        label: String(trade?.tradeDate || trade?.createdAt || ""),
      };
    });
  }, [allTrades]);
  const drawdownPolyline = useMemo(
    () => buildPolyline(drawdownTimelinePoints, { width: 640, height: 220 }),
    [drawdownTimelinePoints]
  );
  const winningTrades = useMemo(
    () => allTrades.filter((trade) => String(trade?.result || "").toLowerCase() === "win"),
    [allTrades]
  );
  const losingTrades = useMemo(
    () => allTrades.filter((trade) => String(trade?.result || "").toLowerCase() === "loss"),
    [allTrades]
  );
  const averageWinRR = useMemo(
    () =>
      winningTrades.length
        ? round(winningTrades.reduce((sum, trade) => sum + toNumber(trade?.rrAchieved, 0), 0) / winningTrades.length, 2)
        : 0,
    [winningTrades]
  );
  const averageLossRR = useMemo(
    () =>
      losingTrades.length
        ? round(
            losingTrades.reduce((sum, trade) => sum + Math.abs(toNumber(trade?.rrAchieved, 0)), 0) / losingTrades.length,
            2
          )
        : 0,
    [losingTrades]
  );
  const winLossRatio = useMemo(() => {
    if (!averageLossRR) {
      return 0;
    }
    return round(averageWinRR / averageLossRR, 2);
  }, [averageLossRR, averageWinRR]);
  const profitFactor = useMemo(() => {
    const grossWin = winningTrades.reduce((sum, trade) => sum + Math.max(toNumber(trade?.rrAchieved, 0), 0), 0);
    const grossLoss = losingTrades.reduce((sum, trade) => sum + Math.abs(Math.min(toNumber(trade?.rrAchieved, 0), 0)), 0);
    if (!grossLoss) {
      return grossWin ? round(grossWin, 2) : 0;
    }
    return round(grossWin / grossLoss, 2);
  }, [losingTrades, winningTrades]);
  const reviewPeriodRows = useMemo(() => {
    if (!activeReviewTrades.length) {
      return [];
    }
    const buckets = new Map();
    [...activeReviewTrades]
      .sort((a, b) => new Date(a?.tradeDate || 0).getTime() - new Date(b?.tradeDate || 0).getTime())
      .forEach((trade) => {
        const tradeDate = new Date(trade?.tradeDate || trade?.createdAt || Date.now());
        const startOfWeek = new Date(tradeDate);
        const day = startOfWeek.getDay();
        const shift = day === 0 ? 6 : day - 1;
        startOfWeek.setDate(startOfWeek.getDate() - shift);
        startOfWeek.setHours(0, 0, 0, 0);
        const key = startOfWeek.toISOString().slice(0, 10);
        if (!buckets.has(key)) {
          buckets.set(key, {
            key,
            trades: 0,
            wins: 0,
            netRR: 0,
          });
        }
        const bucket = buckets.get(key);
        bucket.trades += 1;
        if (String(trade?.result || "").toLowerCase() === "win") {
          bucket.wins += 1;
        }
        bucket.netRR += toNumber(trade?.rrAchieved, 0);
      });
    return Array.from(buckets.values())
      .slice(-4)
      .map((row, index) => ({
        label: `Week ${index + 1}`,
        trades: row.trades,
        netRR: round(row.netRR, 2),
        winRate: row.trades ? round((row.wins / row.trades) * 100, 1) : 0,
      }));
  }, [activeReviewTrades]);
  const reviewInsightItems = useMemo(
    () => [
      {
        tone: "green",
        title: coachingSummary.keep[0] || "Your strongest pattern is holding up well.",
        detail: reviewBestSession
          ? `Session strength is currently led by ${reviewBestSession.label}.`
          : "As more reviewed trades come in, Journex will surface your strongest repeatable edge.",
      },
      {
        tone: "red",
        title: reviewWorstHabit || "No critical leak detected yet.",
        detail: reviewWorstHabitDetail,
      },
      {
        tone: "blue",
        title: `Screenshot coverage sits at ${reviewScreenshotCoverage}%.`,
        detail:
          reviewScreenshotCoverage > 0
            ? "Keep attaching before/after charts so replay and coaching stay visual."
            : "Once screenshots are attached, Journex will reinforce what you actually saw in the moment.",
      },
    ],
    [coachingSummary.keep, reviewBestSession, reviewScreenshotCoverage, reviewWorstHabit, reviewWorstHabitDetail]
  );
  const goalTrackingBars = useMemo(
    () => [
      {
        label: "Daily",
        valueLabel: previewDailyGoalProgress
          ? `${previewDailyGoalProgress.currentPercent >= 0 ? "+" : ""}${previewDailyGoalProgress.currentPercent}%`
          : "Set target",
        fillPercent: previewDailyGoalProgress?.progressPercent || 0,
        tone: "green",
      },
      {
        label: "Weekly",
        valueLabel: previewWeeklyGoalProgress
          ? `${previewWeeklyGoalProgress.currentPercent >= 0 ? "+" : ""}${previewWeeklyGoalProgress.currentPercent}%`
          : "Set target",
        fillPercent: previewWeeklyGoalProgress?.progressPercent || 0,
        tone: "blue",
      },
      {
        label: "Drawdown",
        valueLabel: previewDailyDrawdownProgress ? `${previewDailyDrawdownProgress.usedPercent}% used` : "Set cap",
        fillPercent: previewDailyDrawdownProgress?.progressPercent || 0,
        tone: "red",
      },
    ],
    [previewDailyDrawdownProgress, previewDailyGoalProgress, previewWeeklyGoalProgress]
  );

  const formatAccountSize = useCallback((value) => {
    const amount = Number(value);
    if (!Number.isFinite(amount) || amount <= 0) {
      return "Not set";
    }
    return amount.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });
  }, []);

  useEffect(() => {
    if (!activeProfile) {
      return;
    }
    setSettingsDraft((prev) => ({
      ...prev,
      profileName: activeProfile.name || "",
      profileDescription: activeProfile.description || "",
      accountSize: activeProfile.accountSize ?? 0,
    }));
  }, [activeProfile]);

  useEffect(() => {
    setBridgeLabel(user?.integrations?.mt5?.label || "MT5 Bridge");
  }, [user?.integrations?.mt5?.label]);

  useEffect(() => {
    const handleBeforeInstallPrompt = (event) => {
      event.preventDefault();
      setDeferredInstallPrompt(event);
    };
    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    return () => window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
  }, []);

  useEffect(() => {
    if (activePage !== "review" || !token || !isOnline) {
      return;
    }
    let mounted = true;
    setLoadingReviewShares(true);
    listWeeklyReviewShares(token)
      .then((response) => {
        if (!mounted) {
          return;
        }
        setReviewShares(Array.isArray(response?.data) ? response.data : []);
      })
      .catch(() => {
        if (mounted) {
          setReviewShares([]);
        }
      })
      .finally(() => {
        if (mounted) {
          setLoadingReviewShares(false);
        }
      });
    return () => {
      mounted = false;
    };
  }, [activePage, isOnline, token]);

  const backendBase = useMemo(() => {
    const raw = String(import.meta.env.VITE_API_URL || "").trim();
    const base = raw || window.location.origin;
    return base.replace(/\/+$/, "").replace(/\/api$/i, "");
  }, []);
  const mt5BridgeEndpoint = `${backendBase}/api/trades/bridge/mt5`;
  const mt5BridgeDownloadUrl = `${backendBase}/api/trades/bridge/mt5/download`;
  const mt5BridgeGuideUrl = `${backendBase}/api/trades/bridge/mt5/guide`;

  useEffect(() => {
    setMobileMenuOpen(false);

    // Ensure each page starts from the top when switching views.
    // Some mobile browsers/webviews are picky about scroll targets and options objects.
    const scrollToTop = () => {
      try {
        window.scrollTo(0, 0);
      } catch (error) {
        // Ignore scroll failures (e.g. in non-browser environments).
      }

      const rootScroller = document.scrollingElement || document.documentElement || document.body;
      if (rootScroller && typeof rootScroller.scrollTo === "function") {
        rootScroller.scrollTo(0, 0);
      }

      const content = document.querySelector(".saas-content");
      if (content && typeof content.scrollTo === "function") {
        content.scrollTo(0, 0);
      }
    };

    // Run immediately and again after layout settles.
    scrollToTop();
    const raf = window.requestAnimationFrame(scrollToTop);
    return () => window.cancelAnimationFrame(raf);
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

  useEffect(() => {
    if (!selectedTrade || activePage === "trade-detail") {
      return undefined;
    }

    const onKeyDown = (event) => {
      if (event.key === "Escape") {
        setSelectedTrade(null);
      }
    };

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    window.addEventListener("keydown", onKeyDown);

    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [activePage, selectedTrade]);

  useEffect(() => {
    if (selectedTrade) {
      return;
    }
    setTradeDetailsBusy(false);
    setTradeDetailsError("");
  }, [selectedTrade]);

  useEffect(() => {
    setTradeReplayOpen(false);
  }, [selectedTrade?._id]);

  const parsePlaybooksImport = useCallback(() => {
    try {
      const raw = JSON.parse(playbookImportText || "[]");
      return Array.isArray(raw) ? raw : [];
    } catch {
      return null;
    }
  }, [playbookImportText]);

  const handleAddPlaybookDraft = useCallback(() => {
    const name = String(playbookDraft.name || "").trim();
    if (name.length < 2) {
      notify("error", "Give the playbook a name first.");
      return;
    }
    const existing = Array.isArray(settingsDraft.playbooks) ? settingsDraft.playbooks : [];

    const slug = name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 64);
    const nextPlaybook = {
      id: slug || `playbook-${existing.length + 1}`,
      name,
      setupType: String(playbookDraft.setupType || "").trim(),
      targetSession: String(playbookDraft.targetSession || "").trim(),
      confirmations: String(playbookDraft.confirmations || "")
        .split(/[\n,]/g)
        .map((item) => item.trim())
        .filter(Boolean),
      invalidations: [],
      checklist: String(playbookDraft.checklist || "")
        .split(/[\n,]/g)
        .map((item) => item.trim())
        .filter(Boolean),
      notes: String(playbookDraft.notes || "").trim(),
    };

    const filtered = existing.filter((playbook) => String(playbook?.id || "") !== nextPlaybook.id);
    const nextList = [...filtered, nextPlaybook];
    setSettingsDraft((prev) => ({
      ...prev,
      playbooks: nextList,
    }));
    setPlaybookImportText(JSON.stringify(nextList, null, 2));
    setPlaybookDraft({
      name: "",
      setupType: "",
      targetSession: "",
      confirmations: "",
      checklist: "",
      notes: "",
    });
    notify("success", `${name} added to your playbook library.`);
  }, [notify, playbookDraft, settingsDraft.playbooks]);

  const handleRemovePlaybook = useCallback((playbookId) => {
    const existing = Array.isArray(settingsDraft.playbooks) ? settingsDraft.playbooks : [];
    const nextList = existing.filter((playbook) => String(playbook?.id || "") !== String(playbookId || ""));
    setSettingsDraft((prev) => ({
      ...prev,
      playbooks: nextList,
    }));
    setPlaybookImportText(JSON.stringify(nextList, null, 2));
    notify("success", "Playbook removed.");
  }, [notify, settingsDraft.playbooks]);

  const handleApplyPlaybookImport = useCallback(() => {
    const parsed = parsePlaybooksImport();
    if (!parsed) {
      notify("error", "Playbook JSON is invalid. Fix the JSON before importing.");
      return;
    }
    setSettingsDraft((prev) => ({
      ...prev,
      playbooks: parsed,
    }));
    notify("success", `Imported ${parsed.length} playbook${parsed.length === 1 ? "" : "s"} into the library draft.`);
  }, [notify, parsePlaybooksImport]);

  const handleResetPlaybookImport = useCallback(() => {
    const nextText = JSON.stringify(Array.isArray(settingsDraft.playbooks) ? settingsDraft.playbooks : [], null, 2);
    setPlaybookImportText(nextText);
    notify("success", "Advanced playbook JSON reset to the current library.");
  }, [notify, settingsDraft.playbooks]);

  const handleSaveSettings = useCallback(() => {
    if (typeof handleUpdateUserSettings !== "function") {
      return;
    }

    const fromCsv = (value = "") =>
      String(value || "")
        .split(/[\n,]/g)
        .map((item) => item.trim())
        .filter(Boolean);

    const normalizePairs = (value = "") => {
      const raw = fromCsv(value).map((pair) =>
        String(pair || "")
          .toUpperCase()
          .replace(/[^A-Z0-9]/g, "")
      );
      const filtered = raw.filter((pair) => pair.length >= 3 && pair.length <= 15);
      return filtered.length ? filtered : PAIRS;
    };

    const nextPairs = normalizePairs(settingsDraft.pairs);
    const nextPairsCsv = nextPairs.join(", ");
    if (settingsDraft.pairs !== nextPairsCsv) {
      setSettingsDraft((prev) => ({ ...prev, pairs: nextPairsCsv }));
    }

    void handleUpdateUserSettings({
      options: {
        pairs: nextPairs,
        sessions: fromCsv(settingsDraft.sessions),
        setupTypes: fromCsv(settingsDraft.setupTypes),
      },
      playbooks: Array.isArray(settingsDraft.playbooks) ? settingsDraft.playbooks : [],
      reviewToolkit: {
        mistakeTags: fromCsv(settingsDraft.mistakeTags),
        fundedMode: {
          enabled: Boolean(settingsDraft.fundedModeEnabled),
          provider: settingsDraft.fundedProvider,
          profitTargetPercent: Number(settingsDraft.fundedProfitTargetPercent) || 0,
          maxTotalDrawdownPercent: Number(settingsDraft.fundedMaxTotalDrawdownPercent) || 0,
          consistencyPercent: Number(settingsDraft.fundedConsistencyPercent) || 0,
          minTradingDays: Number(settingsDraft.fundedMinTradingDays) || 0,
        },
      },
      riskControls: {
        requireRuleAlignment: Boolean(settingsDraft.requireRuleAlignment),
        strictChecklistGate: Boolean(settingsDraft.strictChecklistGate),
        maxTradesPerSession: Number(settingsDraft.maxTradesPerSession) || 0,
        cooldownMinutesAfterLoss: Number(settingsDraft.cooldownMinutesAfterLoss) || 0,
        stopForDayLossRR: Number(settingsDraft.stopForDayLossRR) || 0,
        maxRiskPerTradePercent: Number(settingsDraft.maxRiskPerTradePercent) || 0,
        dailyProfitTargetPercent: Number(settingsDraft.dailyProfitTargetPercent) || 0,
        weeklyProfitTargetPercent: Number(settingsDraft.weeklyProfitTargetPercent) || 0,
        maxDailyDrawdownPercent: Number(settingsDraft.maxDailyDrawdownPercent) || 0,
      },
    });
  }, [handleUpdateUserSettings, setSettingsDraft, settingsDraft]);

  const openTrade = async (trade) => {
    if (!trade) {
      return;
    }

    if (activePage !== "trade-detail") {
      setTradeDetailReturnPage(activePage || "review");
    }
    setSelectedTrade(trade);
    setReviewReplayTarget(trade._id || "");
    setTradeDetailsError("");
    setActivePage("trade-detail");

    const tradeId = trade._id;
    const hasDetails =
      trade.entryPrice !== undefined ||
      trade.stopLoss !== undefined ||
      trade.takeProfit !== undefined ||
      trade.plannedRR !== undefined ||
      trade.screenshots?.before ||
      trade.screenshots?.after ||
      trade.notes?.priceAction ||
      trade.notes?.executionReview;

    if (!tradeId || hasDetails || typeof handleFetchTradeDetails !== "function") {
      return;
    }

    setTradeDetailsBusy(true);
    const detailed = await handleFetchTradeDetails(tradeId);
    setTradeDetailsBusy(false);

    if (!detailed) {
      setTradeDetailsError("Could not load full trade details.");
      return;
    }

    setSelectedTrade((prev) => (prev && prev._id === tradeId ? detailed : prev));
  };

  const openTradeFromReview = useCallback(
    (trade) => {
      void openTrade(trade);
    },
    [openTrade]
  );

  const handleAiUiAction = useCallback((action) => {
    if (!action || typeof action !== "object") {
      return;
    }

    if (action.type === "navigate" && action.payload?.page) {
      setActivePage(action.payload.page);
      return;
    }

    if (action.type === "open-trade" && action.payload?.tradeId) {
      const tradeId = String(action.payload.tradeId || "");
      const trade =
        allTrades.find((item) => String(item?._id || item?.clientTradeId || "") === tradeId) ||
        recentTrades.find((item) => String(item?._id || item?.clientTradeId || "") === tradeId) ||
        null;
      if (trade) {
        void openTrade(trade).then(() => {
          if (action.payload?.focus && (trade?.screenshots?.before || trade?.screenshots?.after)) {
            setTradeReplayOpen(true);
          }
        });
      }
    }
  }, [allTrades, openTrade, recentTrades, setActivePage]);

  const openInspectView = useCallback((trade, slot = "before") => {
    if (!trade?._id) {
      return;
    }
    try {
      localStorage.setItem("trading-journal-active-page", "review");
    } catch {
      // ignore storage failures
    }
    const target = `/screenshot/${encodeURIComponent(trade._id)}?slot=${slot === "after" ? "after" : "before"}`;
    window.history.pushState({}, "", target);
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo(0, 0);
    setActivePage("review");
  }, []);

  const handleInstallApp = useCallback(async () => {
    if (!deferredInstallPrompt) {
      return;
    }
    try {
      await deferredInstallPrompt.prompt();
      await deferredInstallPrompt.userChoice;
    } catch {
      // Ignore prompt failures.
    } finally {
      setDeferredInstallPrompt(null);
    }
  }, [deferredInstallPrompt]);

  const handleCreateReviewShare = useCallback(async () => {
    if (!token || !isOnline) {
      return;
    }
    setShareBusy(true);
    setShareError("");
    setShareMessage("");
    try {
      const response = await createWeeklyReviewShare(token, {
        title: "Weekly review",
      });
      const nextShares = await listWeeklyReviewShares(token);
      setReviewShares(Array.isArray(nextShares?.data) ? nextShares.data : []);
      if (response?.shareUrl) {
        try {
          await navigator.clipboard.writeText(response.shareUrl);
          setShareMessage("Weekly review share link copied.");
        } catch {
          setShareMessage(response.shareUrl);
        }
      }
    } catch (error) {
      setShareError(error.message || "Could not create a review share.");
    } finally {
      setShareBusy(false);
    }
  }, [isOnline, token]);

  const handleRevokeShare = useCallback(
    async (shareId) => {
      if (!token || !shareId) {
        return;
      }
      try {
        await revokeWeeklyReviewShare(token, shareId);
        const nextShares = await listWeeklyReviewShares(token);
        setReviewShares(Array.isArray(nextShares?.data) ? nextShares.data : []);
        setShareMessage("Share revoked.");
        setShareError("");
      } catch (error) {
        setShareError(error.message || "Could not revoke share.");
      }
    },
    [token]
  );

  const copyTradeSummary = useCallback(async (trade) => {
    if (!trade) {
      return;
    }
    const summary = [
      `${trade.pair || "Pair"} | ${trade.setupType || "Setup"} | ${formatTradeDate(trade.tradeDate)}`,
      `Result: ${trade.result || "-"} | R: ${toNumber(trade.rrAchieved).toFixed(2)} | Session: ${trade.session || "-"}`,
      trade.playbookName ? `Playbook: ${trade.playbookName}` : "",
      Array.isArray(trade.mistakeTags) && trade.mistakeTags.length ? `Mistakes: ${trade.mistakeTags.join(", ")}` : "",
      trade.notes?.executionReview ? `Review: ${trade.notes.executionReview}` : "",
    ]
      .filter(Boolean)
      .join("\n");
    try {
      await navigator.clipboard.writeText(summary);
      setShareMessage("Trade summary copied.");
      setShareError("");
    } catch {
      setShareError("Clipboard copy failed for trade summary.");
    }
  }, []);

  const stepReplayTrade = useCallback(
    (direction) => {
      if (!replayTrades.length) {
        return;
      }
      const currentIndex = replayTradeIndex >= 0 ? replayTradeIndex : 0;
      const nextIndex = Math.min(Math.max(currentIndex + direction, 0), replayTrades.length - 1);
      const nextTrade = replayTrades[nextIndex];
      if (nextTrade) {
        setReviewReplayTarget(nextTrade._id || "");
      }
    },
    [replayTradeIndex, replayTrades]
  );

  const copyText = async (value, successMessage) => {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setBridgeMessage(successMessage);
      setBridgeError("");
    } catch {
      setBridgeError("Clipboard copy failed. Please copy manually.");
    }
  };

  const handleRotateBridgeKey = async () => {
    if (typeof handleGenerateMt5BridgeKey !== "function") {
      return;
    }

    setBridgeBusy(true);
    setBridgeError("");
    setBridgeMessage("");
    setBridgeKey("");

    const response = await handleGenerateMt5BridgeKey({ label: bridgeLabel });
    if (!response) {
      setBridgeBusy(false);
      setBridgeError("Could not generate a bridge key.");
      return;
    }

    setBridgeKey(response.apiKey || "");
    setBridgeMessage(response.apiKey ? "Bridge key generated. Copy it now (shown once)." : "Bridge key updated.");
    setBridgeBusy(false);
  };

  const handleDisableBridge = async () => {
    if (typeof handleDisableMt5Bridge !== "function") {
      return;
    }

    const shouldDisable = window.confirm("Disable MT5 auto-journal sync and revoke its key?");
    if (!shouldDisable) {
      return;
    }

    setBridgeBusy(true);
    setBridgeError("");
    setBridgeMessage("");
    setBridgeKey("");

    const response = await handleDisableMt5Bridge();
    if (!response) {
      setBridgeBusy(false);
      setBridgeError("Could not disable the bridge.");
      return;
    }

    setBridgeMessage("MT5 bridge disabled.");
    setBridgeBusy(false);
  };

  return (
  <section className="saas-shell app-journal">
    <aside className="saas-sidebar">
      <div className="saas-sidebar-main">
        <div className="saas-brand">
          <BrandLogo className="brand-logo brand-logo-landing" />
          <span>Journex</span>
        </div>
        <nav className="saas-nav">
          {navPages.map((page) => (
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
        <button type="button" className="saas-signout" onClick={onLogout}>
          Logout
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
            <span>Journex</span>
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
          <button type="button" className="saas-signout" onClick={onLogout}>
            Logout
          </button>
        </div>
      </aside>
    </div>

    <section className="saas-content">
      {loading || syncingQueue ? <div className="top-loader" aria-hidden="true" /> : null}

      <div className="saas-topbar">
        <div className="saas-topbar-left">
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
        </div>
        <div className="saas-topbar-right">
          <span className="saas-account-chip">
            Account: {activeProfileAccountSize > 0 ? formatCurrency(activeProfileAccountSize) : "Not set"}
          </span>
        </div>
      </div>

      {!["dashboard", "journal", "trade-detail"].includes(activePage) ? (
      <header className="saas-page-header">
        <div>
          <h1>{activeMeta.title}</h1>
          <p>{activeMeta.subtitle}</p>
        </div>
        {activePage === "trade-detail" ? (
          <button
            type="button"
            className="landing-cta-secondary saas-page-header-action"
            onClick={() => setActivePage(tradeDetailReturnPage || "review")}
          >
            Back to {returnPageInfo?.label || "Review"}
          </button>
        ) : null}
      </header>
      ) : null}

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
            <article className="panel saas-card saas-dashboard-stat-card">
              <p className="saas-stat-kicker">Total Trades</p>
              <p className="saas-stat-value">{totalTrades}</p>
              <p className="saas-stat-label">
                {weeklyTrades.length ? `+${weeklyTrades.length} this week` : "Start building your journal"}
              </p>
            </article>
            <article className="panel saas-card saas-dashboard-stat-card">
              <p className="saas-stat-kicker">Win Rate</p>
              <p className="saas-stat-value">{overallWinRate}%</p>
              <p className="saas-stat-label">
                {monthlyWinRate ? `${monthlyWinRate >= overallWinRate ? "+" : ""}${round(monthlyWinRate - overallWinRate, 1)}% vs broader sample` : winShareLabel}
              </p>
            </article>
            <article className="panel saas-card saas-dashboard-stat-card saas-card-profit">
              <p className="saas-stat-kicker">Net R</p>
              <p className="saas-stat-value">
                {netRR >= 0 ? "+" : "-"}
                {Math.abs(netRR).toFixed(1)}R
              </p>
              <p className="saas-stat-label">{totalWins} winners</p>
            </article>
            <article className="panel saas-card saas-dashboard-stat-card">
              <p className="saas-stat-kicker">Expectancy</p>
              <p className="saas-stat-value">{round(expectancyValue, 2)}R</p>
              <p className="saas-stat-label">{expectancyValue >= 1 ? "Above target" : "Still developing"}</p>
            </article>
          </div>
          <article className="panel saas-card saas-dashboard-chart-card">
            <div className="saas-card-head">
              <h3 className="saas-card-title">Equity Curve</h3>
            </div>
              {totalTrades ? (
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
              ) : (
                <div className="saas-empty-state mt-4">
                  <strong>No equity curve yet</strong>
                  <p>Closed trades will turn this into a live view of your cumulative performance.</p>
                </div>
              )}
          </article>

          <div className="saas-insights-row saas-dashboard-summary-row">
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Top Setup</p>
              <h3>{resolvedSetupTop[0]?.label || "-"}</h3>
              <p className="saas-stat-label">{resolvedSetupTop[0] ? `${resolvedSetupTop[0].trades} trades` : "More trades needed"}</p>
              <p className="saas-dashboard-summary-value saas-dashboard-summary-positive">
                {resolvedSetupTop[0] ? `+${round(toNumber(resolvedSetupTop[0].rr), 1)}R` : "-"}
              </p>
              <p className="saas-stat-label">{resolvedSetupTop[0] ? `${resolvedSetupTop[0].winRate}% win rate` : "No setup edge yet"}</p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Top Session</p>
              <h3>{resolvedSessionTop[0]?.label || "-"}</h3>
              <p className="saas-stat-label">{resolvedSessionTop[0] ? `${resolvedSessionTop[0].trades} trades` : "More trades needed"}</p>
              <p className="saas-dashboard-summary-value saas-dashboard-summary-positive">
                {resolvedSessionTop[0] ? `+${round(toNumber(resolvedSessionTop[0].rr), 1)}R` : "-"}
              </p>
              <p className="saas-stat-label">{resolvedSessionTop[0] ? `${resolvedSessionTop[0].winRate}% win rate` : "No session edge yet"}</p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Biggest Leak</p>
              <h3>{mistakeStats[0]?.label || reviewWorstHabit || "None"}</h3>
              <p className="saas-stat-label">{mistakeStats[0] ? `${mistakeStats[0].trades} trades` : "No tagged leak yet"}</p>
              <p className={`saas-dashboard-summary-value ${mistakeStats[0] ? "saas-dashboard-summary-negative" : ""}`}>
                {mistakeStats[0] ? `-${mistakeStats[0].costRR}R` : "-"}
              </p>
              <p className="saas-stat-label">
                {mistakeStats[0] ? `${mistakeStats[0].winRate}% win rate` : "Tag mistakes in Add Trade to surface your costliest habit"}
              </p>
            </article>
          </div>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <h3 className="saas-card-title">Recent Trades</h3>
            </div>
            <div className="saas-table-wrap">
              <table className="saas-table" aria-describedby="recent-trades-caption">
                <caption id="recent-trades-caption" className="saas-sr-only">
                  Recent trades with pair, type, entry, exit, R, profit or loss, and setup.
                </caption>
                <thead>
                  <tr>
                    <th scope="col">Pair</th>
                    <th scope="col">Type</th>
                    <th scope="col">Entry</th>
                    <th scope="col">Exit</th>
                    <th scope="col">R</th>
                    <th scope="col">P&amp;L</th>
                    <th scope="col">Setup</th>
                  </tr>
                </thead>
                <tbody>
                  {recentTrades.map((trade) => (
                    <tr
                      key={trade._id || `${trade.tradeDate}-${trade.pair}-${trade.setupType}`}
                      className="saas-clickable-row"
                      tabIndex={0}
                      onClick={() => void openTrade(trade)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") {
                          event.preventDefault();
                          void openTrade(trade);
                        }
                      }}
                    >
                      <th scope="row">{trade.pair || "-"}</th>
                      <td data-label="Type">
                        <span className={`saas-result ${String(trade.tradeType || "").toLowerCase() === "sell" ? "saas-result-loss" : "saas-result-win"}`}>
                          {trade.tradeType || "-"}
                        </span>
                      </td>
                      <td data-label="Entry">{Number.isFinite(toFinite(trade.entryPrice)) ? toFinite(trade.entryPrice) : "-"}</td>
                      <td data-label="Exit">{Number.isFinite(toFinite(trade.exitPrice)) ? toFinite(trade.exitPrice) : "-"}</td>
                      <td
                        data-label="R"
                        className={toNumber(trade.rrAchieved) >= 0 ? "saas-table-pnl-positive" : "saas-table-pnl-negative"}
                      >
                        {toNumber(trade.rrAchieved) >= 0 ? "+" : "-"}
                        {Math.abs(toNumber(trade.rrAchieved)).toFixed(2)}R
                      </td>
                      <td
                        data-label="P&L"
                        className={toNumber(trade.rrAchieved) >= 0 ? "saas-table-pnl-positive" : "saas-table-pnl-negative"}
                      >
                        {activeProfileAccountSize > 0 && Number.isFinite(toNumber(trade?.riskPercent))
                          ? `${toNumber(trade.rrAchieved) >= 0 ? "+" : "-"}${formatCurrency(
                              Math.abs((activeProfileAccountSize * (toNumber(trade.riskPercent, 0) / 100)) * toNumber(trade.rrAchieved, 0))
                            )}`
                          : "-"}
                      </td>
                      <td data-label="Setup">{trade.setupType || "-"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>
        </section>
      ) : null}

      {activePage === "journal" ? (
        <section className="space-y-4 saas-page-section saas-page-journal">
          <button type="button" className="saas-back-link" onClick={() => setActivePage("dashboard")}>
            <span aria-hidden="true">&lt;</span> Back to Dashboard
          </button>
          <section className="panel saas-section-switcher saas-journal-intake-panel">
            <div className="saas-section-switcher-head">
              <strong>Smart entry</strong>
              <span>Reuse your recent context so you do less typing.</span>
            </div>
            <div className="saas-section-switcher-tabs">
              <button
                type="button"
                className="saas-section-tab saas-section-tab-active"
                onClick={() => {
                  if (typeof applyRecentTradeDefaults === "function") {
                    applyRecentTradeDefaults();
                  }
                }}
              >
                Use Recent Defaults
              </button>
              <button
                type="button"
                className="saas-section-tab"
                onClick={() => {
                  if (selectedPlaybook?.setupType) {
                    handleQuickTradeChange("setupType", selectedPlaybook.setupType);
                  }
                  if (selectedPlaybook?.targetSession) {
                    handleQuickTradeChange("session", selectedPlaybook.targetSession);
                  }
                }}
                disabled={!selectedPlaybook}
              >
                Apply Playbook Defaults
              </button>
            </div>
          </section>
          <form className="panel saas-card saas-add-trade" onSubmit={handleQuickTradeSubmit}>
            <div className="saas-journal-shell">
            <div className="saas-journal-form-column">
            <div className="saas-journal-top-grid">
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
                  list="quick-pair-options"
                  value={quickTradeForm.pair}
                  onChange={(event) => handleQuickTradeChange("pair", event.target.value)}
                  placeholder="Type or pick a pair"
                  required
                />
                <p className="input-hint">Pick from your saved pairs or type a custom symbol.</p>
                <datalist id="quick-pair-options">
                  {(pairOptions || []).map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
                <div className="chip-row">
                  {(pairOptions || []).slice(0, 4).map((option) => (
                    <button
                      key={`pair-${option}`}
                      type="button"
                      className={`chip-btn ${quickTradeForm.pair === option ? "chip-btn-active" : ""}`}
                      onClick={() => handleQuickTradeChange("pair", option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </label>
              <div className="saas-journal-direction-card">
                <span className="label">Direction</span>
                <div className="chip-row mt-2">
                  {["Buy", "Sell"].map((option) => (
                    <button
                      key={`trade-type-${option}`}
                      type="button"
                      className={`chip-btn ${quickTradeForm.tradeType === option ? "chip-btn-active" : ""}`}
                      onClick={() => handleQuickTradeChange("tradeType", option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
                <p className="input-hint">Use this to calculate default stop/target direction and trade outcome correctly.</p>
              </div>
            </div>

            <div className="saas-form-grid saas-journal-form-grid">
              <label>
                <span className="label">Entry Price</span>
                <input
                  className="input"
                  type="number"
                  step="0.00001"
                  inputMode="decimal"
                  value={quickTradeForm.entryPrice}
                  onChange={(event) => handleQuickTradeChange("entryPrice", event.target.value)}
                  placeholder="1.0850"
                  required
                />
                <p className="input-hint">Required. Use the exact fill price if available.</p>
              </label>
              <label>
                <span className="label">Stop Loss</span>
                <input
                  className="input"
                  type="number"
                  step="0.00001"
                  inputMode="decimal"
                  value={quickTradeForm.stopLoss}
                  onChange={(event) => handleQuickTradeChange("stopLoss", event.target.value)}
                  placeholder="1.0820"
                />
                <p className="input-hint">Optional. Leave blank to auto-calc.</p>
              </label>
              <label>
                <span className="label">Take Profit</span>
                <input
                  className="input"
                  type="number"
                  step="0.00001"
                  inputMode="decimal"
                  value={quickTradeForm.takeProfit}
                  onChange={(event) => handleQuickTradeChange("takeProfit", event.target.value)}
                  placeholder="1.0920"
                />
                <p className="input-hint">Optional. Leave blank to auto-calc.</p>
              </label>
              <label>
                <span className="label">Exit Price</span>
                <input
                  className="input"
                  type="number"
                  step="0.00001"
                  inputMode="decimal"
                  value={quickTradeForm.exitPrice}
                  onChange={(event) => handleQuickTradeChange("exitPrice", event.target.value)}
                  placeholder="1.0920"
                />
                <p className="input-hint">Optional. Add when trade closes.</p>
              </label>
              <label>
                <span className="label">Risk:Reward Ratio</span>
                <input
                  className="input"
                  value={quickTradeForm.plannedRR}
                  onChange={(event) => handleQuickTradeChange("plannedRR", event.target.value)}
                  placeholder="2.5"
                />
                <p className="input-hint">If blank, Journex calculates using stop and take profit.</p>
              </label>
              <label>
                <span className="label">Risk %</span>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="0.1"
                  value={quickTradeForm.riskPercent}
                  onChange={(event) => handleQuickTradeChange("riskPercent", event.target.value)}
                  placeholder="1"
                />
                <p className="input-hint">Used for account-based growth, drawdown, and risk warnings.</p>
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
                <div className="chip-row">
                  {setupOptions.slice(0, 3).map((option) => (
                    <button
                      key={`setup-${option}`}
                      type="button"
                      className={`chip-btn ${quickTradeForm.setupType === option ? "chip-btn-active" : ""}`}
                      onClick={() => handleQuickTradeChange("setupType", option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
              </label>
              <label>
                <span className="label">Playbook</span>
                <select
                  className="input"
                  value={quickTradeForm.playbookId}
                  onChange={(event) => {
                    const nextId = event.target.value;
                    const selectedPlaybook = playbooks.find((playbook) => playbook.id === nextId);
                    handleQuickTradeChange("playbookId", nextId);
                    if (selectedPlaybook?.setupType) {
                      handleQuickTradeChange("setupType", selectedPlaybook.setupType);
                    }
                    if (selectedPlaybook?.targetSession) {
                      handleQuickTradeChange("session", selectedPlaybook.targetSession);
                    }
                  }}
                >
                  <option value="">No playbook</option>
                  {playbooks.map((playbook) => (
                    <option key={playbook.id} value={playbook.id}>
                      {playbook.name}
                    </option>
                  ))}
                </select>
                <p className="input-hint">
                  {selectedPlaybook
                    ? `Journex can auto-fill setup and session from ${selectedPlaybook.name}.`
                    : "Journex will auto-match a playbook when your setup and session clearly fit one."}
                </p>
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
                <div className="chip-row">
                  {sessionOptions.slice(0, 3).map((option) => (
                    <button
                      key={`session-${option}`}
                      type="button"
                      className={`chip-btn ${quickTradeForm.session === option ? "chip-btn-active" : ""}`}
                      onClick={() => handleQuickTradeChange("session", option)}
                    >
                      {option}
                    </button>
                  ))}
                </div>
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

            <details className="saas-collapsible saas-journal-advanced">
              <summary className="saas-collapsible-summary">
                Advanced context
                <span>Lifecycle, mistakes, and execution detail</span>
              </summary>
              <div className="saas-collapsible-body">
                <article className="saas-note-card">
                  <div className="saas-card-head">
                    <div>
                      <h3 className="saas-card-title">Trade Context</h3>
                      <p className="saas-card-subtitle">Lifecycle and execution notes.</p>
                    </div>
                  </div>
                  <div className="saas-form-grid">
                    <label>
                      <span className="label">Scale-ins</span>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        value={quickTradeForm.scaleInCount}
                        onChange={(event) => handleQuickTradeChange("scaleInCount", event.target.value)}
                      />
                    </label>
                    <label>
                      <span className="label">Scale-outs</span>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        value={quickTradeForm.scaleOutCount}
                        onChange={(event) => handleQuickTradeChange("scaleOutCount", event.target.value)}
                      />
                    </label>
                    <label>
                      <span className="label">Partial closes</span>
                      <input
                        className="input"
                        type="number"
                        min="0"
                        value={quickTradeForm.partialCloseCount}
                        onChange={(event) => handleQuickTradeChange("partialCloseCount", event.target.value)}
                      />
                    </label>
                    <label>
                      <span className="label">Exit reason</span>
                      <input
                        className="input"
                        value={quickTradeForm.exitReason}
                        onChange={(event) => handleQuickTradeChange("exitReason", event.target.value)}
                        placeholder="Target, manual close, stop, time-based..."
                      />
                    </label>
                  </div>
                  <div className="chip-row mt-3">
                    <button
                      type="button"
                      className={`chip-btn ${quickTradeForm.movedStopToBreakeven ? "chip-btn-active" : ""}`}
                      onClick={() =>
                        handleQuickTradeChange("movedStopToBreakeven", !quickTradeForm.movedStopToBreakeven)
                      }
                    >
                      Moved to breakeven
                    </button>
                    <button
                      type="button"
                      className={`chip-btn ${quickTradeForm.trailingStopUsed ? "chip-btn-active" : ""}`}
                      onClick={() => handleQuickTradeChange("trailingStopUsed", !quickTradeForm.trailingStopUsed)}
                    >
                      Trailing stop used
                    </button>
                  </div>
                </article>

                {mistakeCatalog.length ? (
                  <article className="saas-note-card">
                    <div className="saas-card-head">
                      <div>
                        <h3 className="saas-card-title">Mistakes</h3>
                        <p className="saas-card-subtitle">Tag any execution leak.</p>
                      </div>
                    </div>
                    <div className="chip-row">
                      {mistakeCatalog.map((mistake) => {
                        const isActive = (quickTradeForm.mistakeTags || []).includes(mistake);
                        return (
                          <button
                            key={`mistake-${mistake}`}
                            type="button"
                            className={`chip-btn ${isActive ? "chip-btn-active" : ""}`}
                            onClick={() =>
                              handleQuickTradeChange(
                                "mistakeTags",
                                isActive
                                  ? (quickTradeForm.mistakeTags || []).filter((item) => item !== mistake)
                                  : [...(quickTradeForm.mistakeTags || []), mistake]
                              )
                            }
                          >
                            {mistake}
                          </button>
                        );
                      })}
                    </div>
                  </article>
                ) : null}
              </div>
            </details>

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
                className="btn-secondary"
                onClick={resetQuickTradeForm}
                disabled={savingQuickTrade}
              >
                Cancel
              </button>
            </div>
            </div>

            <aside className="saas-journal-side-column">
            <div
              className={`saas-risk-panel saas-journal-side-card ${
                quickTradeRiskSnapshot.isOverMaxRisk
                  ? "saas-risk-panel-danger"
                  : quickTradeRiskSnapshot.isNearMaxRisk
                    ? "saas-risk-panel-warn"
                    : "saas-risk-panel-muted"
              }`}
            >
              <div className="saas-risk-panel-head">
                <strong>Risk check</strong>
                {maxRiskPerTradePercent > 0 ? <span>Max {maxRiskPerTradePercent}% per trade</span> : null}
              </div>
              <div className="saas-account-grid">
                <div className="saas-metric-item">
                  <span>Account Size</span>
                  <strong>{activeProfileAccountSize > 0 ? formatCurrency(activeProfileAccountSize) : "Not set"}</strong>
                </div>
                <div className="saas-metric-item">
                  <span>Risk Planned</span>
                  <strong>
                    {quickTradeRiskSnapshot.riskPercent > 0
                      ? `${quickTradeRiskSnapshot.riskPercent}% (${formatCurrency(quickTradeRiskSnapshot.riskAmount)})`
                      : "0%"}
                  </strong>
                </div>
                <div className="saas-metric-item">
                  <span>Planned R:R</span>
                  <strong>{quickTradeRiskSnapshot.plannedRR > 0 ? `${quickTradeRiskSnapshot.plannedRR}x` : "Waiting for stop + take profit"}</strong>
                </div>
                <div className="saas-metric-item">
                  <span>Projected Reward</span>
                  <strong>{quickTradeRiskSnapshot.projectedRewardAmount > 0 ? formatCurrency(quickTradeRiskSnapshot.projectedRewardAmount) : "-"}</strong>
                </div>
                <div className="saas-metric-item">
                  <span>Suggested Lot Size</span>
                  <strong>{quickTradeRiskSnapshot.suggestedLotSize > 0 ? quickTradeRiskSnapshot.suggestedLotSize : "-"}</strong>
                </div>
              </div>
              {!quickTradeRiskSnapshot.hasAccountSize ? (
                <p className="saas-risk-panel-note">
                  Add an account size in Settings so Journex can translate this trade into real money risk and account growth.
                </p>
              ) : null}
              {quickTradeRiskSnapshot.isOverMaxRisk ? (
                <p className="saas-risk-panel-note">
                  This trade exceeds your saved max risk cap. You can still save it, but it will be flagged in guardrails.
                </p>
              ) : null}
              {!quickTradeRiskSnapshot.isOverMaxRisk && quickTradeRiskSnapshot.isNearMaxRisk ? (
                <p className="saas-risk-panel-note">
                  This trade is close to your max risk cap. Double-check position size before saving.
                </p>
              ) : null}
            </div>

            <label className="saas-toggle-row saas-journal-side-card">
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

            <div className="saas-note-card saas-journal-side-card">
              <div className="saas-card-head">
                <div>
                  <h3 className="saas-card-title">Screenshots</h3>
                  <p className="saas-card-subtitle">Keep the visual context with your trade from start to finish.</p>
                </div>
              </div>
            <div className="saas-form-grid saas-journal-screenshot-grid">
              <label>
                <span className="label">Screenshot (Before)</span>
                <input
                  className="input"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(event) => handleQuickTradeChange("screenshotBefore", event.target.files?.[0] || null)}
                />
                {quickTradeForm.screenshotBefore ? (
                  <small className="text-xs text-textMuted">{quickTradeForm.screenshotBefore.name}</small>
                ) : null}
              </label>
              <label>
                <span className="label">Screenshot (After)</span>
                <input
                  className="input"
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(event) => handleQuickTradeChange("screenshotAfter", event.target.files?.[0] || null)}
                />
                {quickTradeForm.screenshotAfter ? (
                  <small className="text-xs text-textMuted">{quickTradeForm.screenshotAfter.name}</small>
                ) : null}
              </label>
            </div>
            </div>
            </aside>
            </div>
          </form>
        </section>
      ) : null}

      {activePage === "analytics" ? (
        <section className="space-y-4 saas-page-section saas-page-analytics">
          <article className="panel saas-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Setup Performance</h3>
                <p className="saas-card-subtitle">Net R by setup using your actual journal history.</p>
              </div>
            </div>
            <div className="saas-bars saas-bars-performance" style={{ "--saas-bars-columns": String(Math.max(setupPerformanceRows.slice(0, 5).length, 1)) }}>
              {setupPerformanceRows.length ? (
                setupPerformanceRows.slice(0, 5).map((item) => (
                  <div key={item.label} className="saas-bar-item">
                    <div
                      className={`saas-bar ${toNumber(item.rr) < 0 ? "saas-bar-negative" : ""}`}
                      style={{ height: `${Math.min(Math.max(Math.abs(toNumber(item.rr)) * 14, 12), 100)}%` }}
                    />
                    <span>{item.label}</span>
                  </div>
                ))
              ) : (
                <div className="saas-empty-state">
                  <strong>No setup analytics yet</strong>
                  <p>Log a few closed trades with setup names to compare pattern quality.</p>
                </div>
              )}
            </div>
          </article>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <h3 className="saas-card-title">Setup Breakdown</h3>
            </div>
            <div className="saas-table-wrap">
              <table className="saas-table">
                <thead>
                  <tr>
                    <th scope="col">Setup</th>
                    <th scope="col">Total R</th>
                    <th scope="col">Trades</th>
                    <th scope="col">Win Rate</th>
                    <th scope="col">Avg R</th>
                  </tr>
                </thead>
                <tbody>
                  {setupPerformanceRows.slice(0, 5).map((item) => (
                    <tr key={`setup-breakdown-${item.label}`}>
                      <th scope="row">{item.label}</th>
                      <td className={toNumber(item.rr) >= 0 ? "saas-table-pnl-positive" : "saas-table-pnl-negative"}>
                        {toNumber(item.rr) >= 0 ? "+" : "-"}{Math.abs(toNumber(item.rr)).toFixed(1)}R
                      </td>
                      <td>{item.trades}</td>
                      <td>{item.winRate}%</td>
                      <td>{toNumber(item.avgRR).toFixed(2)}R</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </article>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Session Performance</h3>
                <p className="saas-card-subtitle">See where your edge shows up with the most consistency.</p>
              </div>
            </div>
            <div className="saas-bars saas-bars-performance" style={{ "--saas-bars-columns": String(Math.max(sessionPerformanceRows.slice(0, 4).length, 1)) }}>
              {sessionPerformanceRows.length ? (
                sessionPerformanceRows.slice(0, 4).map((item) => (
                  <div key={item.label} className="saas-bar-item">
                    <div className="saas-bar saas-bar-green" style={{ height: `${Math.min(Math.max(Math.abs(toNumber(item.rr)) * 14, 12), 100)}%` }} />
                    <span>{item.label}</span>
                  </div>
                ))
              ) : (
                <div className="saas-empty-state">
                  <strong>No session analytics yet</strong>
                  <p>Sessions start ranking themselves once your journal has enough trade history.</p>
                </div>
              )}
            </div>
          </article>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Drawdown Analysis</h3>
                <p className="saas-card-subtitle">Peak-to-trough pressure across your recent trade sequence.</p>
              </div>
            </div>
            {drawdownTimelinePoints.length ? (
              <svg viewBox="0 0 640 220" className="saas-line-chart saas-line-chart-danger" aria-hidden="true">
                <polyline
                  points={drawdownPolyline}
                  fill="none"
                  stroke="#ef4444"
                  strokeWidth="4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <div className="saas-empty-state mt-4">
                <strong>No drawdown analysis yet</strong>
                <p>Closed trades will build this pressure curve automatically.</p>
              </div>
            )}
          </article>

          <div className="saas-stats-grid saas-stats-grid-analytics-bottom">
            <article className="panel saas-card saas-dashboard-stat-card">
              <p className="saas-stat-kicker">Avg Win</p>
              <p className="saas-stat-value saas-stat-value-positive">+{averageWinRR.toFixed(1)}R</p>
            </article>
            <article className="panel saas-card saas-dashboard-stat-card">
              <p className="saas-stat-kicker">Avg Loss</p>
              <p className="saas-stat-value saas-stat-value-negative">-{averageLossRR.toFixed(1)}R</p>
            </article>
            <article className="panel saas-card saas-dashboard-stat-card">
              <p className="saas-stat-kicker">Win/Loss Ratio</p>
              <p className="saas-stat-value">{winLossRatio.toFixed(1)}</p>
            </article>
            <article className="panel saas-card saas-dashboard-stat-card">
              <p className="saas-stat-kicker">Profit Factor</p>
              <p className="saas-stat-value">{profitFactor.toFixed(1)}</p>
            </article>
          </div>
        </section>
      ) : null}


      {activePage === "review" ? (
        <section className="space-y-4 saas-page-section saas-page-review">
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
          <div className="saas-insights-row saas-review-summary-row">
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Best Setup</p>
              <h3>{reviewBestSetup?.label || "-"}</h3>
              <p className="saas-stat-label">{reviewBestSetup ? `${reviewBestSetup.trades} trades` : "No setup data yet"}</p>
              <p className="saas-dashboard-summary-value saas-dashboard-summary-positive">
                {reviewBestSetup ? `+${round(toNumber(reviewBestSetup.rr), 1)}R` : "-"}
              </p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Worst Habit</p>
              <h3>{mistakeStats[0]?.label || reviewWorstHabit}</h3>
              <p className="saas-stat-label">{mistakeStats[0] ? `${mistakeStats[0].trades} trades` : "No tagged habit yet"}</p>
              <p className="saas-dashboard-summary-value saas-dashboard-summary-negative">
                {mistakeStats[0] ? `-${mistakeStats[0].costRR}R` : "-"}
              </p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Screenshot Coverage</p>
              <h3>{reviewScreenshotCoverage}%</h3>
              <p className="saas-stat-label">{reviewTradesWithScreenshots}/{activeReviewTrades.length || 0} trades</p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Trade Breakdown</p>
              <div className="saas-review-breakdown-list">
                <div><span>Winners</span><strong className="saas-table-pnl-positive">{activeReviewTrades.filter((trade) => String(trade?.result || "").toLowerCase() === "win").length}</strong></div>
                <div><span>Losers</span><strong className="saas-table-pnl-negative">{activeReviewTrades.filter((trade) => String(trade?.result || "").toLowerCase() === "loss").length}</strong></div>
              </div>
            </article>
          </div>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <h3 className="saas-card-title">Weekly Performance</h3>
            </div>
            {reviewPeriodRows.length ? (
              <div className="saas-table-wrap">
                <table className="saas-table">
                  <thead>
                    <tr>
                      <th scope="col">Period</th>
                      <th scope="col">Trades</th>
                      <th scope="col">Net R</th>
                      <th scope="col">Win Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {reviewPeriodRows.map((row) => (
                      <tr key={`review-period-${row.label}`}>
                        <th scope="row">{row.label}</th>
                        <td>{row.trades}</td>
                        <td className={row.netRR >= 0 ? "saas-table-pnl-positive" : "saas-table-pnl-negative"}>
                          {row.netRR >= 0 ? "+" : "-"}{Math.abs(row.netRR).toFixed(1)}R
                        </td>
                        <td>{row.winRate}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="saas-empty-state">
                <strong>No review periods yet</strong>
                <p>Closed trades in this range will roll up into a clean weekly performance table.</p>
              </div>
            )}
          </article>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <h3 className="saas-card-title">Key Insights</h3>
            </div>
            <div className="saas-key-insights">
              {reviewInsightItems.map((item) => (
                <div key={`review-insight-${item.title}`} className={`saas-key-insight saas-key-insight-${item.tone}`}>
                  <strong>{item.title}</strong>
                  <p>{item.detail}</p>
                </div>
              ))}
            </div>
          </article>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <h3 className="saas-card-title">Past Trades</h3>
              <div className="flex w-full flex-col gap-2 sm:w-auto sm:flex-row sm:items-center sm:justify-end">
                <input
                  className="input !py-2 text-sm sm:w-[240px]"
                  value={tradeSearch}
                  onChange={(event) => setTradeSearch(event.target.value)}
                  placeholder="Search (pair, setup, session...)"
                />
                <span className="chip text-textMain">{filteredReviewTrades.length}/{activeReviewTrades.length}</span>
                <button
                  type="button"
                  className="chip quick-chart-btn"
                  disabled={!isOnline || exportingCsv || typeof handleExportTradesCsv !== "function"}
                  onClick={() => {
                    if (typeof handleExportTradesCsv !== "function") {
                      return;
                    }
                    void handleExportTradesCsv();
                  }}
                >
                  {exportingCsv ? "Exporting..." : "Export CSV"}
                </button>
              </div>
            </div>
            <p className="saas-stat-label mt-2">Tap a row to revisit the full trade details.</p>
            {!filteredReviewTrades.length ? (
              <div className="saas-empty-state mt-3">
                <strong>No trades match this search</strong>
                <p>Try a broader pair, setup, or session query to bring the trade list back into view.</p>
              </div>
            ) : (
              <div className="saas-table-wrap mt-3">
                <table className="saas-table" aria-describedby="review-trades-caption">
                  <caption id="review-trades-caption" className="saas-sr-only">
                    Trade history table for the selected review range.
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">Date</th>
                      <th scope="col">Pair</th>
                      <th scope="col">Type</th>
                      <th scope="col">R</th>
                      <th scope="col">P&amp;L</th>
                      <th scope="col">Setup</th>
                      <th scope="col">Screenshot</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredReviewTrades.map((trade) => (
                      <tr
                        key={trade._id || trade.clientTradeId || `${trade.tradeDate}-${trade.pair}-${trade.setupType}`}
                        className="saas-clickable-row"
                        tabIndex={0}
                        onClick={() => openTradeFromReview(trade)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            openTradeFromReview(trade);
                          }
                        }}
                      >
                        <th scope="row">{formatTradeDate(trade.tradeDate)}</th>
                        <td data-label="Pair">{trade.pair || "-"}</td>
                        <td data-label="Type">
                          <span className={`saas-result ${String(trade.tradeType || "").toLowerCase() === "sell" ? "saas-result-loss" : "saas-result-win"}`}>
                            {trade.tradeType || "-"}
                          </span>
                        </td>
                        <td
                          data-label="R"
                          className={toNumber(trade.rrAchieved) >= 0 ? "saas-table-pnl-positive" : "saas-table-pnl-negative"}
                        >
                          {toNumber(trade.rrAchieved) >= 0 ? "+" : "-"}
                          {Math.abs(toNumber(trade.rrAchieved)).toFixed(2)}R
                        </td>
                        <td
                          data-label="P&L"
                          className={toNumber(trade.rrAchieved) >= 0 ? "saas-table-pnl-positive" : "saas-table-pnl-negative"}
                        >
                          {activeProfileAccountSize > 0 && Number.isFinite(toNumber(trade?.riskPercent))
                            ? `${toNumber(trade.rrAchieved) >= 0 ? "+" : "-"}${formatCurrency(
                                Math.abs((activeProfileAccountSize * (toNumber(trade.riskPercent, 0) / 100)) * toNumber(trade.rrAchieved, 0))
                              )}`
                            : "-"}
                        </td>
                        <td data-label="Setup">{trade.setupType || "-"}</td>
                        <td data-label="Screenshot">{trade?.screenshots?.before || trade?.screenshots?.after ? "Yes" : "-"}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
            {reviewRange === "all" && activeReviewTrades.length >= 500 ? (
              <p className="saas-stat-label mt-3">
                Showing the latest 500 trades. Use Export CSV for full history.
              </p>
            ) : null}
          </article>
        </section>
      ) : null}

      {activePage === "coaching" ? (
        <section className="space-y-4 saas-page-section saas-page-coaching">
          <div className="saas-coaching-workspace">
          <article className="panel saas-card saas-coaching-guide-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Review Coach</h3>
                <p className="saas-card-subtitle">Keep, stop, test next, and use AI in one coaching workspace.</p>
              </div>
              <span className="chip text-textMain">Assistant</span>
            </div>
            <div className="saas-coaching-grid mt-4">
              <div className="saas-note-card saas-coaching-card">
                <h4>Keep</h4>
                <ul className="saas-note-list saas-note-list-plain">
                  {coachingSummary.keep.map((item) => (
                    <li key={`coach-keep-${item}`}>
                      <span><strong>{item}</strong></span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="saas-note-card saas-coaching-card">
                <h4>Stop</h4>
                <ul className="saas-note-list saas-note-list-plain">
                  {coachingSummary.stop.map((item) => (
                    <li key={`coach-stop-${item}`}>
                      <span><strong>{item}</strong></span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="saas-note-card saas-coaching-card saas-coaching-card-emphasis">
                <h4>Test Next</h4>
                <ul className="saas-note-list saas-note-list-plain">
                  {coachingSummary.test.map((item) => (
                    <li key={`coach-test-${item}`}>
                      <span><strong>{item}</strong></span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
            <div className="saas-note-card saas-coaching-summary mt-4">
              <h4>Coach Summary</h4>
              <p className="saas-stat-label mt-2">{coachingSummary.assistant}</p>
              {reviewMistakeStats.length ? (
                <p className="saas-stat-label mt-2">
                  <strong>{reviewMistakeStats[0].label}</strong> is costing <strong>-{reviewMistakeStats[0].costRR}R</strong> across {reviewMistakeStats[0].trades} tagged trades.
                </p>
              ) : (
                <div className="saas-empty-state mt-2">
                  <strong>No mistakes tagged yet</strong>
                  <p>Once you tag mistakes during review or trade entry, the coach will surface the biggest leak here.</p>
                </div>
              )}
            </div>
          </article>
          <AiCoachPanel
            context={aiCoachContext}
            activeProfileName={activeProfile?.name || previewProfileName}
            profileId={activeProfile?.id || user?.activeProfileId || "main"}
            onExecuteAction={handleAiUiAction}
          />
          </div>
        </section>
      ) : null}

      {activePage === "playbooks" ? (
        <section className="space-y-4 saas-page-section saas-page-playbooks">
          <article className="panel saas-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Playbook Library</h3>
                <p className="saas-card-subtitle">Your trading strategies, confirmations, and checklist rules.</p>
              </div>
              <button type="button" className="btn-primary" onClick={() => setShowPlaybookBuilder((current) => !current)}>
                {showPlaybookBuilder ? "Hide Builder" : "+ New Playbook"}
              </button>
            </div>
            {showPlaybookBuilder ? (
              <div className="saas-main-grid saas-playbooks-library-grid mt-4">
                <article className="saas-note-card">
                <h4>Quick Builder</h4>
                <div className="saas-form-grid mt-3">
                  <label>
                    <span className="label">Playbook name</span>
                    <input
                      className="input"
                      value={playbookDraft.name}
                      onChange={(event) => setPlaybookDraft((prev) => ({ ...prev, name: event.target.value }))}
                      placeholder="London continuation"
                      disabled={!isOnline || savingUserSettings}
                    />
                  </label>
                  <label>
                    <span className="label">Setup</span>
                    <select
                      className="input"
                      value={playbookDraft.setupType}
                      onChange={(event) => setPlaybookDraft((prev) => ({ ...prev, setupType: event.target.value }))}
                      disabled={!isOnline || savingUserSettings}
                    >
                      <option value="">No setup</option>
                      {setupOptions.map((option) => (
                        <option key={`playbook-setup-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    <span className="label">Target session</span>
                    <select
                      className="input"
                      value={playbookDraft.targetSession}
                      onChange={(event) => setPlaybookDraft((prev) => ({ ...prev, targetSession: event.target.value }))}
                      disabled={!isOnline || savingUserSettings}
                    >
                      <option value="">Any session</option>
                      {sessionOptions.map((option) => (
                        <option key={`playbook-session-${option}`} value={option}>
                          {option}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="saas-settings-span-full">
                    <span className="label">Confirmations</span>
                    <input
                      className="input"
                      value={playbookDraft.confirmations}
                      onChange={(event) => setPlaybookDraft((prev) => ({ ...prev, confirmations: event.target.value }))}
                      placeholder="Liquidity sweep, displacement, reclaim"
                      disabled={!isOnline || savingUserSettings}
                    />
                  </label>
                  <label className="saas-settings-span-full">
                    <span className="label">Checklist</span>
                    <input
                      className="input"
                      value={playbookDraft.checklist}
                      onChange={(event) => setPlaybookDraft((prev) => ({ ...prev, checklist: event.target.value }))}
                      placeholder="Bias aligned, stop defined, target mapped"
                      disabled={!isOnline || savingUserSettings}
                    />
                  </label>
                  <label className="saas-settings-span-full">
                    <span className="label">Notes</span>
                    <textarea
                      className="input"
                      rows={3}
                      value={playbookDraft.notes}
                      onChange={(event) => setPlaybookDraft((prev) => ({ ...prev, notes: event.target.value }))}
                      placeholder="What makes this playbook valid and when should you leave it alone?"
                      disabled={!isOnline || savingUserSettings}
                    />
                  </label>
                </div>
                <div className="saas-settings-actions mt-4">
                  <button
                    type="button"
                    className="btn-primary"
                    onClick={handleAddPlaybookDraft}
                    disabled={!isOnline || savingUserSettings}
                  >
                    Add Playbook Draft
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleSaveSettings}
                    disabled={!isOnline || savingUserSettings}
                  >
                    {savingUserSettings ? "Saving..." : "Save Playbooks"}
                  </button>
                </div>
                </article>
                <article className="saas-note-card">
                <h4>How it works</h4>
                <ul className="saas-note-list saas-note-list-plain mt-3">
                  <li><span><strong>1.</strong> Build or update the playbook visually here.</span></li>
                  <li><span><strong>2.</strong> Save once to sync it into Journex.</span></li>
                  <li><span><strong>3.</strong> Attach it in Add Trade so AI and Review can compare execution against the plan.</span></li>
                </ul>
                </article>
              </div>
            ) : null}
            <div className="saas-main-grid mt-4">
              {draftPlaybooks.length ? (
                draftPlaybooks.map((playbook) => (
                  <article key={`playbook-card-${playbook.id}`} className="saas-note-card">
                    <h4>{playbook.name || "Untitled playbook"}</h4>
                    <p className="saas-playbook-meta mt-2">
                      <span>{playbook.setupType || "No setup"}</span>
                      {playbook.targetSession ? <span>{playbook.targetSession}</span> : null}
                      <span>{Array.isArray(playbook.confirmations) ? `${playbook.confirmations.length} confirmations` : "0 confirmations"}</span>
                    </p>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {Array.isArray(playbook.confirmations)
                        ? playbook.confirmations.slice(0, 3).map((item) => (
                            <span key={`pb-confirm-${playbook.id}-${item}`} className="chip">{item}</span>
                          ))
                        : null}
                      {Array.isArray(playbook.checklist)
                        ? playbook.checklist.slice(0, 2).map((item) => (
                            <span key={`pb-check-${playbook.id}-${item}`} className="chip">{item}</span>
                          ))
                        : null}
                    </div>
                    <div className="saas-playbook-card-stats">
                      <div>
                        <span>Win Rate</span>
                        <strong>{playbookStats.find((item) => item.label === playbook.name)?.winRate ?? "-"}</strong>
                      </div>
                      <div>
                        <span>Total R</span>
                        <strong className="saas-table-pnl-positive">
                          {playbookStats.find((item) => item.label === playbook.name)
                            ? `+${round(toNumber(playbookStats.find((item) => item.label === playbook.name)?.rr), 1)}R`
                            : "-"}
                        </strong>
                      </div>
                    </div>
                    <div className="saas-settings-actions mt-3">
                      <button
                        type="button"
                        className="btn-secondary"
                        onClick={() => setShowPlaybookBuilder(true)}
                      >
                        View Details
                      </button>
                      <button
                        type="button"
                        className="landing-cta-secondary"
                        onClick={() => handleRemovePlaybook(playbook.id)}
                        disabled={!isOnline || savingUserSettings}
                      >
                        Remove
                      </button>
                    </div>
                  </article>
                ))
              ) : (
                <div className="saas-empty-state">
                  <strong>No playbooks yet</strong>
                  <p>Use the New Playbook button to start building your first strategy card.</p>
                </div>
              )}
            </div>
            <label className="saas-settings-span-full mt-4">
              <span className="label">Mistake labels</span>
              <textarea
                className="input"
                rows={3}
                value={settingsDraft.mistakeTags}
                onChange={(event) => setSettingsDraft((prev) => ({ ...prev, mistakeTags: event.target.value }))}
                placeholder="Late entry, Oversized risk, Early close"
                disabled={!isOnline || savingUserSettings}
              />
            </label>
            <details className="saas-collapsible mt-4">
              <summary className="saas-collapsible-summary">
                Advanced playbook editor
                <span>Only open this when you want to import or bulk edit JSON</span>
              </summary>
              <div className="saas-collapsible-body">
                <label className="saas-settings-span-full">
                  <span className="label">Playbooks JSON</span>
                  <textarea
                    className="input font-mono text-xs"
                    rows={12}
                    value={playbookImportText}
                    onChange={(event) => setPlaybookImportText(event.target.value)}
                    placeholder='[{"id":"london-breakout","name":"London Breakout","setupType":"Breakout"}]'
                    disabled={!isOnline || savingUserSettings}
                  />
                </label>
                <div className="saas-settings-actions mt-4">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleApplyPlaybookImport}
                    disabled={!isOnline || savingUserSettings}
                  >
                    Replace Library From JSON
                  </button>
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={handleResetPlaybookImport}
                    disabled={!isOnline || savingUserSettings}
                  >
                    Reset JSON To Current Library
                  </button>
                </div>
              </div>
            </details>
            <div className="saas-settings-actions mt-4">
              <button
                type="button"
                className="btn-primary"
                disabled={!isOnline || savingUserSettings || typeof handleUpdateUserSettings !== "function"}
                onClick={handleSaveSettings}
              >
                {savingUserSettings ? "Saving..." : "Save Playbooks"}
              </button>
              <button type="button" className="btn-secondary" onClick={() => setActivePage("settings")}>
                Back to Settings
              </button>
            </div>
          </article>
        </section>
      ) : null}

      {activePage === "risk" ? (
        <section className="space-y-4 saas-page-section saas-page-risk">
          <div className="saas-insights-row">
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Account size</p>
              <h3>{previewAccountSize > 0 ? formatCurrency(previewAccountSize) : "-"}</h3>
              <p className="saas-stat-label">Active profile: {previewProfileName}</p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Account return</p>
              <h3>{previewAccountPerformance ? `${previewAccountPerformance.returnPercent >= 0 ? "+" : ""}${previewAccountPerformance.returnPercent}%` : "-"}</h3>
              <p className="saas-stat-label">
                {previewAccountPerformance
                  ? `${formatCurrency(previewAccountPerformance.currentBalance)} current balance`
                  : "Set an account size to unlock account-aware performance."}
              </p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Max drawdown</p>
              <h3>{previewAccountPerformance ? `${previewAccountPerformance.maxDrawdownPercent}%` : "-"}</h3>
              <p className="saas-stat-label">Account risk lives here instead of spreading across Review and Settings.</p>
            </article>
          </div>

          <article className="panel saas-card saas-settings-workspace-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Equity + Goal Tracking</h3>
                <p className="saas-card-subtitle">Account goals, drawdown caps, and funded challenge progress. Draft changes preview here before you save.</p>
              </div>
              {showSettingsPreview ? <span className="chip text-textMain">Live preview</span> : null}
            </div>
            <div className="saas-risk-tracking-grid mt-4">
              <div className="saas-risk-chart-panel">
                {previewAccountTimeline.points.length > 1 ? (
                  <div className="saas-equity-curve-card">
                    <svg viewBox="0 0 640 260" preserveAspectRatio="none" aria-hidden="true">
                      <polyline points={previewAccountBalancePolyline} />
                    </svg>
                  </div>
                ) : (
                  <p className="saas-stat-label">Add risk-aware trades to build an account equity curve.</p>
                )}
              </div>
              <div className="saas-risk-side-panel">
                <div className="saas-mini-graph saas-mini-graph-goals">
                  {goalTrackingBars.map((metric) => (
                    <div key={metric.label} className="saas-mini-graph-row">
                      <div className="saas-mini-graph-meta">
                        <span>{metric.label}</span>
                        <strong>{metric.valueLabel}</strong>
                      </div>
                      <div className="saas-mini-graph-track" aria-hidden="true">
                        <span className={`saas-mini-graph-fill saas-mini-graph-fill-${metric.tone}`} style={{ width: `${metric.fillPercent}%` }} />
                      </div>
                    </div>
                  ))}
                </div>
                <div className="saas-risk-overview-grid">
              <div className="saas-note-card saas-goal-card">
                <h4>Daily Goal</h4>
                {previewDailyGoalProgress ? (
                  <>
                    <p className="saas-stat-label mt-2">
                      {previewDailyAccountPerformance?.returnPercent?.toFixed(2)}% of {previewDailyGoalProgress.targetPercent}% target
                    </p>
                    <div className="saas-progress saas-progress-green mt-3">
                      <span style={{ width: `${previewDailyGoalProgress.progressPercent}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="saas-stat-label mt-2">Set a daily profit target to track progress here.</p>
                )}
              </div>
              <div className="saas-note-card saas-goal-card">
                <h4>Weekly Goal</h4>
                {previewWeeklyGoalProgress ? (
                  <>
                    <p className="saas-stat-label mt-2">
                      {previewWeeklyAccountPerformance?.returnPercent?.toFixed(2)}% of {previewWeeklyGoalProgress.targetPercent}% target
                    </p>
                    <div className="saas-progress saas-progress-green mt-3">
                      <span style={{ width: `${previewWeeklyGoalProgress.progressPercent}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="saas-stat-label mt-2">Set a weekly profit target to track progress here.</p>
                )}
              </div>
              <div className="saas-note-card saas-goal-card">
                <h4>Daily Drawdown</h4>
                {previewDailyDrawdownProgress ? (
                  <>
                    <p className="saas-stat-label mt-2">
                      {previewDailyDrawdownProgress.usedPercent}% used of {previewDailyDrawdownProgress.capPercent}% cap
                    </p>
                    <div className="saas-progress saas-progress-red mt-3">
                      <span style={{ width: `${previewDailyDrawdownProgress.progressPercent}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="saas-stat-label mt-2">Set a daily drawdown cap to track protection here.</p>
                )}
              </div>
                </div>
              </div>
            </div>
          </article>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Risk Controls</h3>
                <p className="saas-card-subtitle">Move all rule limits and funded challenge settings into one control center.</p>
              </div>
            </div>
            <div className="saas-settings-grid mt-3">
              <label className="flex items-center gap-2 text-sm text-textMain">
                <input
                  type="checkbox"
                  checked={Boolean(settingsDraft.requireRuleAlignment)}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, requireRuleAlignment: event.target.checked }))}
                  disabled={!isOnline || savingUserSettings}
                />
                Require rule-alignment reason when breaking rules
              </label>
              <label className="flex items-center gap-2 text-sm text-textMain">
                <input
                  type="checkbox"
                  checked={Boolean(settingsDraft.strictChecklistGate)}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, strictChecklistGate: event.target.checked }))}
                  disabled={!isOnline || savingUserSettings}
                />
                Enforce checklist gate before saving trades
              </label>
              <label className="flex items-center gap-2 text-sm text-textMain saas-settings-span-full">
                <input
                  type="checkbox"
                  checked={Boolean(settingsDraft.fundedModeEnabled)}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, fundedModeEnabled: event.target.checked }))}
                  disabled={!isOnline || savingUserSettings}
                />
                Enable funded-account mode
              </label>
              <label>
                <span className="label">Max trades per session</span>
                <input className="input" type="number" min="0" value={settingsDraft.maxTradesPerSession} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, maxTradesPerSession: event.target.value }))} disabled={!isOnline || savingUserSettings} />
              </label>
              <label>
                <span className="label">Cooldown after loss (minutes)</span>
                <input className="input" type="number" min="0" value={settingsDraft.cooldownMinutesAfterLoss} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, cooldownMinutesAfterLoss: event.target.value }))} disabled={!isOnline || savingUserSettings} />
              </label>
              <label>
                <span className="label">Stop for day loss (RR)</span>
                <input className="input" type="number" min="0" step="0.1" value={settingsDraft.stopForDayLossRR} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, stopForDayLossRR: event.target.value }))} disabled={!isOnline || savingUserSettings} />
              </label>
              <label>
                <span className="label">Max risk per trade (%)</span>
                <input className="input" type="number" min="0" step="0.1" value={settingsDraft.maxRiskPerTradePercent} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, maxRiskPerTradePercent: event.target.value }))} disabled={!isOnline || savingUserSettings} />
              </label>
              <label>
                <span className="label">Daily profit target (%)</span>
                <input className="input" type="number" min="0" step="0.1" value={settingsDraft.dailyProfitTargetPercent} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, dailyProfitTargetPercent: event.target.value }))} disabled={!isOnline || savingUserSettings} />
              </label>
              <label>
                <span className="label">Weekly profit target (%)</span>
                <input className="input" type="number" min="0" step="0.1" value={settingsDraft.weeklyProfitTargetPercent} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, weeklyProfitTargetPercent: event.target.value }))} disabled={!isOnline || savingUserSettings} />
              </label>
              <label>
                <span className="label">Max daily drawdown (%)</span>
                <input className="input" type="number" min="0" step="0.1" value={settingsDraft.maxDailyDrawdownPercent} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, maxDailyDrawdownPercent: event.target.value }))} disabled={!isOnline || savingUserSettings} />
              </label>
              <label>
                <span className="label">Funded provider</span>
                <input className="input" value={settingsDraft.fundedProvider} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, fundedProvider: event.target.value }))} placeholder="FTMO / prop challenge / personal rules" disabled={!isOnline || savingUserSettings} />
              </label>
              <label>
                <span className="label">Profit target (%)</span>
                <input className="input" type="number" min="0" step="0.1" value={settingsDraft.fundedProfitTargetPercent} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, fundedProfitTargetPercent: event.target.value }))} disabled={!isOnline || savingUserSettings} />
              </label>
              <label>
                <span className="label">Max total drawdown (%)</span>
                <input className="input" type="number" min="0" step="0.1" value={settingsDraft.fundedMaxTotalDrawdownPercent} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, fundedMaxTotalDrawdownPercent: event.target.value }))} disabled={!isOnline || savingUserSettings} />
              </label>
              <label>
                <span className="label">Consistency cap (%)</span>
                <input className="input" type="number" min="0" step="1" value={settingsDraft.fundedConsistencyPercent} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, fundedConsistencyPercent: event.target.value }))} disabled={!isOnline || savingUserSettings} />
              </label>
              <label>
                <span className="label">Minimum trading days</span>
                <input className="input" type="number" min="0" step="1" value={settingsDraft.fundedMinTradingDays} onChange={(event) => setSettingsDraft((prev) => ({ ...prev, fundedMinTradingDays: event.target.value }))} disabled={!isOnline || savingUserSettings} />
              </label>
            </div>
            <div className="saas-settings-actions mt-4">
              <button
                type="button"
                className="btn-primary"
                disabled={!isOnline || savingUserSettings || typeof handleUpdateUserSettings !== "function"}
                onClick={handleSaveSettings}
              >
                {savingUserSettings ? "Saving..." : "Save Risk Center"}
              </button>
              <button type="button" className="landing-cta-secondary" onClick={() => setActivePage("settings")}>
                Back to Settings
              </button>
            </div>
          </article>
        </section>
      ) : null}

      {activePage === "trade-detail" ? (
          <section className="space-y-4 saas-page-section saas-page-trade-detail">
          {selectedTrade ? (
            <article className="panel saas-card">
              <div className="saas-trade-modal-head">
                <div className="min-w-0">
                  <p className="saas-stat-label">
                    {formatTradeDate(selectedTrade.tradeDate)} - {selectedTrade.pair || "-"}
                  </p>
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="saas-trade-modal-title">{selectedTrade.setupType || "Trade Details"}</h3>
                    <TradeOutcome result={selectedTrade.result} />
                  </div>
                </div>
                <button
                  type="button"
                  className="saas-trade-modal-close"
                  onClick={() => setActivePage(tradeDetailReturnPage || "review")}
                  aria-label="Back to previous page"
                >
                  <svg viewBox="0 0 20 20" aria-hidden="true">
                    <path d="M12.5 5.5L7.5 10l5 4.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" />
                  </svg>
                </button>
              </div>

              <div className="saas-trade-modal-body">
                {tradeDetailsBusy ? <p className="saas-alert">Loading trade details...</p> : null}
                {tradeDetailsError ? <p className="saas-alert saas-alert-error">{tradeDetailsError}</p> : null}
                <ul className="saas-detail-list">
                  <li><span>Session</span><strong>{selectedTrade.session || "-"}</strong></li>
                  <li><span>Trade type</span><strong>{selectedTrade.tradeType || "-"}</strong></li>
                  <li><span>Playbook</span><strong>{selectedTrade.playbookName || selectedTrade.playbookId || "-"}</strong></li>
                  <li><span>Entry</span><strong>{Number.isFinite(toFinite(selectedTrade.entryPrice)) ? toFinite(selectedTrade.entryPrice) : "-"}</strong></li>
                  <li><span>Stop</span><strong>{Number.isFinite(toFinite(selectedTrade.stopLoss)) ? toFinite(selectedTrade.stopLoss) : "-"}</strong></li>
                  <li><span>Take profit</span><strong>{Number.isFinite(toFinite(selectedTrade.takeProfit)) ? toFinite(selectedTrade.takeProfit) : "-"}</strong></li>
                  <li><span>Planned R:R</span><strong>{Number.isFinite(toFinite(selectedTrade.plannedRR)) ? toFinite(selectedTrade.plannedRR).toFixed(2) : "-"}</strong></li>
                  <li><span>Net R</span><strong>{Number.isFinite(toFinite(selectedTrade.rrAchieved)) ? `${toFinite(selectedTrade.rrAchieved).toFixed(2)}R` : "-"}</strong></li>
                  <li><span>Risk %</span><strong>{Number.isFinite(toFinite(selectedTrade.riskPercent)) ? `${toFinite(selectedTrade.riskPercent).toFixed(2)}%` : "-"}</strong></li>
                  <li><span>Lot size</span><strong>{Number.isFinite(toFinite(selectedTrade.lotSize)) ? toFinite(selectedTrade.lotSize) : "-"}</strong></li>
                  <li><span>Amount risked</span><strong>{selectedTradeImpact ? formatCurrency(selectedTradeImpact.riskAmount) : "-"}</strong></li>
                  <li><span>Account P/L</span><strong>{selectedTradeImpact ? `${selectedTradeImpact.pnlAmount >= 0 ? "+" : "-"}${formatCurrency(Math.abs(selectedTradeImpact.pnlAmount))}` : "-"}</strong></li>
                  <li><span>Account impact</span><strong>{selectedTradeImpact ? `${selectedTradeImpact.pnlPercent >= 0 ? "+" : ""}${selectedTradeImpact.pnlPercent}%` : "-"}</strong></li>
                  <li><span>Balance after</span><strong>{selectedTradeImpact ? formatCurrency(selectedTradeImpact.balanceAfter) : "-"}</strong></li>
                  <li><span>Source</span><strong>{selectedTrade.automation?.source || selectedTrade.importSource || "manual"}</strong></li>
                  <li><span>Status</span><strong>{selectedTrade.automation?.status || "closed"}</strong></li>
                  <li><span>Scale-ins</span><strong>{toNumber(selectedTrade.lifecycle?.scaleInCount, 0)}</strong></li>
                  <li><span>Scale-outs</span><strong>{toNumber(selectedTrade.lifecycle?.scaleOutCount, 0)}</strong></li>
                  <li><span>Partial closes</span><strong>{toNumber(selectedTrade.lifecycle?.partialCloseCount, 0)}</strong></li>
                  <li><span>Exit reason</span><strong>{selectedTrade.lifecycle?.exitReason || "-"}</strong></li>
                </ul>
                <div className="mt-3 flex flex-wrap gap-2">
                  {selectedTrade.tags?.asiaHighLowUsed ? <span className="chip">Asia HL</span> : null}
                  {selectedTrade.tags?.pocInteraction ? <span className="chip">POC</span> : null}
                  {selectedTrade.tags?.cleanSetup ? <span className="chip">Clean</span> : null}
                  {selectedTrade.tags?.pocOutcome ? <span className="chip">{selectedTrade.tags.pocOutcome}</span> : null}
                  {selectedTrade.lifecycle?.movedStopToBreakeven ? <span className="chip">Moved to BE</span> : null}
                  {selectedTrade.lifecycle?.trailingStopUsed ? <span className="chip">Trailing stop</span> : null}
                  {selectedTradeJournalLabels.map((label) => (
                    <span key={`trade-page-label-${label}`} className="chip">{label}</span>
                  ))}
                  {Array.isArray(selectedTrade.mistakeTags)
                    ? selectedTrade.mistakeTags.map((tag) => (
                        <span key={`trade-page-mistake-${tag}`} className="chip">{tag}</span>
                      ))
                    : null}
                </div>
                {selectedTrade.ruleBreakReason ? (
                  <div className="saas-note-card mt-3">
                    <p className="text-xs uppercase tracking-wide text-textMuted">Rule Break Reason</p>
                    <p className="mt-2 text-sm text-textMain whitespace-pre-wrap">{selectedTrade.ruleBreakReason}</p>
                  </div>
                ) : null}
                {selectedTrade.notes?.priceAction || selectedTrade.notes?.executionReview || selectedTrade.notes?.emotionalState ? (
                  <div className="saas-note-card mt-3">
                    <p className="text-xs uppercase tracking-wide text-textMuted">Notes</p>
                    {selectedTrade.notes?.priceAction ? <p className="mt-2 text-sm text-textMain whitespace-pre-wrap">{selectedTrade.notes.priceAction}</p> : null}
                    {selectedTrade.notes?.executionReview ? <p className="mt-2 text-sm text-textMain whitespace-pre-wrap">{selectedTrade.notes.executionReview}</p> : null}
                    {selectedTrade.notes?.emotionalState ? <p className="mt-2 text-sm text-textMain">Emotion: {selectedTrade.notes.emotionalState}</p> : null}
                  </div>
                ) : null}
                {selectedTrade.screenshots?.before || selectedTrade.screenshots?.after ? (
                  <div className="saas-note-card mt-3">
                    <p className="text-xs uppercase tracking-wide text-textMuted">Screenshots</p>
                    <div className="saas-trade-media mt-3">
                      {selectedTrade.screenshots?.before ? (
                        <figure className="saas-trade-media-item">
                          <img src={selectedTrade.screenshots.before} alt="Entry screenshot" loading="lazy" />
                          <figcaption className="saas-stat-label mt-2">Entry</figcaption>
                        </figure>
                      ) : null}
                      {selectedTrade.screenshots?.after ? (
                        <figure className="saas-trade-media-item">
                          <img src={selectedTrade.screenshots.after} alt="Exit screenshot" loading="lazy" />
                          <figcaption className="saas-stat-label mt-2">Exit</figcaption>
                        </figure>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {tradeReplayOpen && (selectedTrade?.screenshots?.before || selectedTrade?.screenshots?.after) ? (
                  <div className="mt-3">
                    <Suspense fallback={<LazyPanelFallback message="Loading screenshot replay..." />}>
                      <ScreenshotReplay
                        trades={[selectedTrade]}
                        selectedTradeId={selectedTrade?._id || ""}
                        onOpenInspect={openInspectView}
                      />
                    </Suspense>
                  </div>
                ) : null}
                <div className="saas-settings-actions mt-4">
                  <button type="button" className="btn-primary" onClick={() => setActivePage(tradeDetailReturnPage || "review")}>
                    Back
                  </button>
                  {selectedTrade?.screenshots?.before || selectedTrade?.screenshots?.after ? (
                    <button
                      type="button"
                      className="landing-cta-secondary"
                      onClick={() => setTradeReplayOpen((current) => !current)}
                    >
                      {tradeReplayOpen ? "Hide Replay" : "Replay Screenshots"}
                    </button>
                  ) : null}
                  {selectedTrade?.screenshots?.before || selectedTrade?.screenshots?.after ? (
                    <button type="button" className="landing-cta-secondary" onClick={() => openInspectView(selectedTrade, selectedTrade?.screenshots?.before ? "before" : "after")}>
                      Inspect Fullscreen
                    </button>
                  ) : null}
                  <button type="button" className="landing-cta-secondary" onClick={() => void copyTradeSummary(selectedTrade)}>
                    Copy Summary
                  </button>
                </div>
              </div>
            </article>
          ) : (
            <article className="panel saas-card">
              <div className="saas-empty-state">
                <strong>No trade selected</strong>
                <p>Open a trade from Review or Replay and Journex will load the full detail view here.</p>
              </div>
              <div className="saas-settings-actions mt-4">
                <button type="button" className="btn-primary" onClick={() => setActivePage(tradeDetailReturnPage || "review")}>
                  Back
                </button>
              </div>
            </article>
          )}
        </section>
      ) : null}

      {activePage === "settings" ? (
        <section className="space-y-4 saas-page-section saas-page-settings">
          <div className="saas-insights-row saas-insights-row-settings">
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Active profile</p>
              <h3>{previewProfileName}</h3>
              <p className="saas-stat-label">
                {previewAccountPerformance
                  ? `${formatAccountSize(previewAccountSize)} start | ${previewAccountPerformance.returnPercent >= 0 ? "+" : ""}${previewAccountPerformance.returnPercent}% return`
                  : previewAccountSize > 0
                    ? `Account size ${formatAccountSize(previewAccountSize)}`
                    : "Your current trading workspace and saved configuration."}
              </p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Connection</p>
              <h3>{loading || syncingQueue ? "Syncing" : isOnline ? "Online" : "Offline"}</h3>
              <p className="saas-stat-label">
                {offlineQueue.length ? `${offlineQueue.length} trades waiting to sync.` : "Everything is currently in sync."}
              </p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">MT5 bridge</p>
              <h3>{user?.integrations?.mt5?.enabled ? "Enabled" : "Inactive"}</h3>
              <p className="saas-stat-label">
                {user?.integrations?.mt5?.enabled ? "Bridge is ready to receive automated trade events." : "Enable the bridge to import MT5 trades automatically."}
              </p>
            </article>
          </div>

          <article className="panel saas-card">
            <div className="saas-section-header">
              <span className="saas-stat-icon saas-stat-icon-blue">
                <IconGlyph name="settings" />
              </span>
              <div>
                <h3 className="saas-card-title">Workspace Settings</h3>
                <p className="saas-card-subtitle">Manage profiles, theme, and the workspace this account uses every day.</p>
              </div>
            </div>
            <div className="saas-settings-grid saas-settings-grid-trade-options">
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
              <div className="saas-settings-theme-row saas-settings-theme-row-form">
                <span className="label">Create profile</span>
                <div className="saas-inline-form saas-inline-form-profile-create">
                  <input
                    className="input saas-inline-form-main"
                    value={newProfileName}
                    onChange={(event) => setNewProfileName(event.target.value)}
                    placeholder="Profile name"
                    maxLength={40}
                    disabled={!isOnline || creatingProfile}
                  />
                  <input
                    className="input saas-inline-form-compact"
                    type="number"
                    min="0"
                    step="0.01"
                    value={newProfileAccountSize}
                    onChange={(event) => setNewProfileAccountSize(event.target.value)}
                    placeholder="Account size"
                    disabled={!isOnline || creatingProfile}
                  />
                  <button
                    type="button"
                    className="btn-primary saas-inline-form-action !px-4 !py-2 text-sm"
                    disabled={!isOnline || creatingProfile || newProfileName.trim().length < 2 || typeof handleProfileCreate !== "function"}
                    onClick={async () => {
                      const trimmed = newProfileName.trim();
                      if (trimmed.length < 2 || typeof handleProfileCreate !== "function") {
                        return;
                      }
                      const created = await handleProfileCreate({
                        name: trimmed,
                        accountSize: Number(newProfileAccountSize) || 0,
                        makeActive: true,
                      });
                      if (created) {
                        setNewProfileName("");
                        setNewProfileAccountSize("");
                      }
                    }}
                  >
                    {creatingProfile ? "Creating..." : "Create"}
                  </button>
                </div>
              </div>
              <label>
                <span className="label">Active profile name</span>
                <input
                  className="input"
                  value={settingsDraft.profileName}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, profileName: event.target.value }))}
                  placeholder="Main Profile"
                  maxLength={80}
                  disabled={!isOnline || savingProfile}
                />
              </label>
              <label>
                <span className="label">Active profile description</span>
                <input
                  className="input"
                  value={settingsDraft.profileDescription}
                  onChange={(event) => setSettingsDraft((prev) => ({ ...prev, profileDescription: event.target.value }))}
                  placeholder="Describe this account or strategy profile"
                  maxLength={200}
                  disabled={!isOnline || savingProfile}
                />
              </label>
              <label>
                <span className="label">Active profile account size</span>
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <input
                    className="input w-full sm:w-[220px]"
                    type="number"
                    min="0"
                    step="0.01"
                    value={settingsDraft.accountSize}
                    onChange={(event) => setSettingsDraft((prev) => ({ ...prev, accountSize: event.target.value }))}
                    placeholder="10000"
                    disabled={!isOnline || savingProfile}
                  />
                  <button
                    type="button"
                    className="btn-primary !px-4 !py-2 text-sm"
                    disabled={!isOnline || savingProfile || typeof handleProfileUpdate !== "function" || !activeProfile?.id}
                    onClick={() => {
                      if (typeof handleProfileUpdate !== "function" || !activeProfile?.id) {
                        return;
                      }
                      void handleProfileUpdate(activeProfile.id, {
                        name: settingsDraft.profileName,
                        description: settingsDraft.profileDescription,
                        accountSize: Number(settingsDraft.accountSize) || 0,
                      });
                    }}
                  >
                    {savingProfile ? "Saving..." : "Save profile"}
                  </button>
                </div>
              </label>
              <div className="saas-settings-theme-row">
                <span className="label">Delete profile</span>
                <div className="flex w-full flex-wrap items-center justify-end gap-2">
                  <span className="saas-stat-label">
                    {activeProfile?.isDefault
                      ? "Default profile cannot be deleted."
                      : (user?.profiles || []).length <= 1
                        ? "Keep at least one profile."
                        : "Trades will move to your default profile."}
                  </span>
                  <button
                    type="button"
                    className="landing-cta-secondary"
                    disabled={
                      !isOnline ||
                      savingProfile ||
                      typeof handleProfileDelete !== "function" ||
                      !activeProfile?.id ||
                      activeProfile?.isDefault ||
                      (user?.profiles || []).length <= 1
                    }
                    onClick={() => {
                      if (
                        typeof handleProfileDelete !== "function" ||
                        !activeProfile?.id ||
                        activeProfile?.isDefault ||
                        (user?.profiles || []).length <= 1
                      ) {
                        return;
                      }
                      const confirmed = window.confirm(
                        `Delete profile "${activeProfile.name}"? Trades will move to your default profile.`
                      );
                      if (!confirmed) {
                        return;
                      }
                      void handleProfileDelete(activeProfile.id);
                    }}
                  >
                    {savingProfile ? "Working..." : "Delete profile"}
                  </button>
                </div>
              </div>
              <div className="saas-settings-theme-row">
                <span className="label">Profile performance</span>
                <div className="flex w-full flex-wrap items-center justify-end gap-2">
                  {activeAccountPerformance ? (
                    <>
                      <span className="chip text-textMain">
                        Return {activeAccountPerformance.returnPercent >= 0 ? "+" : ""}{activeAccountPerformance.returnPercent}%
                      </span>
                      <span className="chip text-textMain">
                        DD -{activeAccountPerformance.maxDrawdownPercent}%
                      </span>
                    </>
                  ) : (
                    <span className="saas-stat-label">Save an account size to unlock balance-based metrics.</span>
                  )}
                </div>
              </div>
              <div className="saas-settings-theme-row">
                <span className="label">Theme</span>
                <ThemeToggle
                  theme={theme}
                  onToggle={() => setTheme((prev) => (prev === "dark" ? "light" : "dark"))}
                />
              </div>
            </div>
          </article>

          <div className="saas-settings-secondary-grid">
            <article className="panel saas-card">
              <div className="saas-section-header">
                <span className="saas-stat-icon saas-stat-icon-violet">
                  <IconGlyph name="add-trade" />
                </span>
                <div>
                  <h3 className="saas-card-title">Trade Options</h3>
                  <p className="saas-card-subtitle">Define the default pairs, sessions, and setup labels used across the journal.</p>
                </div>
              </div>
              <div className="saas-settings-grid">
                <label>
                  <span className="label">Pairs</span>
                  <textarea
                    className="input"
                    rows={2}
                    value={settingsDraft.pairs}
                    onChange={(event) => setSettingsDraft((prev) => ({ ...prev, pairs: event.target.value }))}
                    placeholder="EURUSD, GBPUSD, XAUUSD"
                    disabled={!isOnline || savingUserSettings}
                  />
                </label>
                <label>
                  <span className="label">Sessions</span>
                  <textarea
                    className="input"
                    rows={2}
                    value={settingsDraft.sessions}
                    onChange={(event) => setSettingsDraft((prev) => ({ ...prev, sessions: event.target.value }))}
                    placeholder="London, New York, Asia"
                    disabled={!isOnline || savingUserSettings}
                  />
                </label>
                <label>
                  <span className="label">Setup Types</span>
                  <textarea
                    className="input"
                    rows={2}
                    value={settingsDraft.setupTypes}
                    onChange={(event) => setSettingsDraft((prev) => ({ ...prev, setupTypes: event.target.value }))}
                    placeholder="Breakout, Pullback, Reversal"
                    disabled={!isOnline || savingUserSettings}
                  />
                </label>
              </div>
            </article>

            <article className="panel saas-card">
              <div className="saas-card-head">
                <div>
                  <h3 className="saas-card-title">Strategy Pages</h3>
                  <p className="saas-card-subtitle">Keep heavier tools on dedicated pages so settings stays clean.</p>
                </div>
              </div>
              <div className="saas-main-grid mt-4">
                <div className="saas-note-card">
                  <h4>Playbooks</h4>
                  <p className="saas-stat-label mt-2">
                    Manage playbooks, setup rules, and mistake labels away from the main settings flow.
                  </p>
                  <div className="saas-settings-actions mt-3">
                    <button type="button" className="btn-primary" onClick={() => setActivePage("playbooks")}>
                      Open Playbooks
                    </button>
                  </div>
                </div>
                <div className="saas-note-card">
                  <h4>Risk Center</h4>
                  <p className="saas-stat-label mt-2">
                    Keep risk controls, funded rules, and account goals on their own dedicated page.
                  </p>
                  <div className="saas-settings-actions mt-3">
                    <button type="button" className="btn-secondary" onClick={() => setActivePage("risk")}>
                      Open Risk Center
                    </button>
                  </div>
                </div>
              </div>
              <div className="saas-settings-actions mt-4">
                <button
                  type="button"
                  className="btn-primary"
                  disabled={!isOnline || savingUserSettings || typeof handleUpdateUserSettings !== "function"}
                  onClick={handleSaveSettings}
                >
                  {savingUserSettings ? "Saving..." : "Save settings"}
                </button>
              </div>
              {!isOnline ? <p className="saas-stat-label mt-2">Go online to save settings changes.</p> : null}
            </article>
          </div>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">MT5 Auto Journal Bridge</h3>
                <p className="saas-card-subtitle">Connect the MT5 bridge to auto-record fills, screenshots, and session events.</p>
              </div>
              <span className="chip text-textMain">{user?.integrations?.mt5?.enabled ? "Enabled" : "Disabled"}</span>
            </div>
            <p className="saas-stat-label mt-2">
              Download the bridge script to auto-import trades and screenshots from MT5.
            </p>

            <div className="saas-settings-grid saas-settings-grid-bridge mt-3">
              <label>
                <span className="label">Bridge label</span>
                <input
                  className="input"
                  value={bridgeLabel}
                  onChange={(event) => setBridgeLabel(event.target.value)}
                  placeholder="MT5 Bridge"
                  maxLength={80}
                  disabled={!isOnline || bridgeBusy}
                />
              </label>

              <div className="saas-settings-theme-row">
                <span className="label">Bridge endpoint</span>
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <input className="input w-full sm:w-[360px]" value={mt5BridgeEndpoint} readOnly />
                  <button
                    type="button"
                    className="chip text-textMain transition hover:border-accent"
                    onClick={() => copyText(mt5BridgeEndpoint, "Bridge endpoint copied.")}
                  >
                    Copy
                  </button>
                </div>
              </div>

              <div className="saas-settings-theme-row">
                <span className="label">Key hint</span>
                <span className="chip text-textMain">
                  {user?.integrations?.mt5?.keyHint ? `****${user.integrations.mt5.keyHint}` : "Not set"}
                </span>
              </div>

              {bridgeKey ? (
                <div className="saas-settings-theme-row">
                  <span className="label">New API key</span>
                  <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                    <input className="input w-full sm:w-[360px]" value={bridgeKey} readOnly />
                    <button
                      type="button"
                      className="chip text-textMain transition hover:border-accent"
                      onClick={() => copyText(bridgeKey, "Bridge key copied.")}
                    >
                      Copy
                    </button>
                  </div>
                </div>
              ) : null}

              {user?.integrations?.mt5?.createdAt ? (
                <div className="saas-settings-theme-row">
                  <span className="label">Created</span>
                  <span className="saas-stat-label">{formatDateTime(user.integrations.mt5.createdAt) || "-"}</span>
                </div>
              ) : null}
              {user?.integrations?.mt5?.lastUsedAt ? (
                <div className="saas-settings-theme-row">
                  <span className="label">Last used</span>
                  <span className="saas-stat-label">{formatDateTime(user.integrations.mt5.lastUsedAt) || "-"}</span>
                </div>
              ) : null}
              {user?.integrations?.mt5?.lastEventAt ? (
                <div className="saas-settings-theme-row">
                  <span className="label">Last event</span>
                  <span className="saas-stat-label">
                    {formatDateTime(user.integrations.mt5.lastEventAt) || "-"}
                    {user?.integrations?.mt5?.lastEventType ? ` | ${user.integrations.mt5.lastEventType}` : ""}
                  </span>
                </div>
              ) : null}
            </div>

            {bridgeError ? (
              <p className="saas-alert saas-alert-error mt-3" role="alert">
                {bridgeError}
              </p>
            ) : null}
            {bridgeMessage ? (
              <p className="saas-alert mt-3" role="status" aria-live="polite">
                {bridgeMessage}
              </p>
            ) : null}

            <div className="saas-settings-actions mt-3">
              <a className="btn-primary" href={mt5BridgeDownloadUrl} download>
                Download EA
              </a>
              <a className="landing-cta-secondary" href={mt5BridgeGuideUrl} target="_blank" rel="noreferrer">
                Setup guide
              </a>
              <button
                type="button"
                className="btn-primary"
                disabled={!isOnline || bridgeBusy || typeof handleGenerateMt5BridgeKey !== "function"}
                onClick={handleRotateBridgeKey}
              >
                {bridgeBusy
                  ? "Working..."
                  : user?.integrations?.mt5?.enabled
                    ? "Rotate key"
                    : "Enable bridge"}
              </button>
              {user?.integrations?.mt5?.enabled ? (
                <button
                  type="button"
                  className="landing-cta-secondary"
                  disabled={!isOnline || bridgeBusy || typeof handleDisableMt5Bridge !== "function"}
                  onClick={handleDisableBridge}
                >
                  Disable
                </button>
              ) : null}
            </div>
          </article>

          <article className="panel saas-card">
            <div className="saas-section-header">
              <span className="saas-stat-icon saas-stat-icon-green">
                <IconGlyph name="pulse" />
              </span>
              <div>
                <h3 className="saas-card-title">Queue & Session</h3>
                <p className="saas-card-subtitle">Monitor sync state, pending actions, and account session controls.</p>
              </div>
            </div>
            <div className="saas-settings-theme-row mb-3">
              <span className="label">Connection</span>
              <div className="flex flex-wrap items-center justify-end gap-2">
                <span className="chip text-textMain">{loading || syncingQueue ? "Syncing..." : isOnline ? "Online" : "Offline"}</span>
                {offlineQueue.length ? <span className="chip">{offlineQueue.length} queued</span> : null}
              </div>
            </div>
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

    {selectedTrade && activePage !== "trade-detail" ? (
      <div
        className="modal-backdrop"
        role="dialog"
        aria-modal="true"
        aria-label="Trade details"
        onClick={() => setSelectedTrade(null)}
      >
        <aside
          className="modal-card saas-trade-modal animate-riseIn"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="saas-trade-modal-head">
            <div className="min-w-0">
              <p className="saas-stat-label">
                {formatTradeDate(selectedTrade.tradeDate)} - {selectedTrade.pair || "-"}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <h3 className="saas-trade-modal-title">{selectedTrade.setupType || "Trade Details"}</h3>
                <TradeOutcome result={selectedTrade.result} />
              </div>
            </div>
            <button
              type="button"
              className="saas-trade-modal-close"
              onClick={() => setSelectedTrade(null)}
              aria-label="Close trade details"
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

          <div className="saas-trade-modal-body">
            {tradeDetailsBusy ? (
              <p className="saas-alert" role="status" aria-live="polite">
                Loading trade details...
              </p>
            ) : null}
            {tradeDetailsError ? (
              <p className="saas-alert saas-alert-error" role="alert">
                {tradeDetailsError}
              </p>
            ) : null}
            <ul className="saas-detail-list">
              <li>
                <span>Session</span>
                <strong>{selectedTrade.session || "-"}</strong>
              </li>
              <li>
                <span>Trade type</span>
                <strong>{selectedTrade.tradeType || "-"}</strong>
              </li>
              <li>
                <span>Playbook</span>
                <strong>{selectedTrade.playbookName || selectedTrade.playbookId || "-"}</strong>
              </li>
              <li>
                <span>Entry</span>
                <strong>
                  {Number.isFinite(toFinite(selectedTrade.entryPrice))
                    ? toFinite(selectedTrade.entryPrice)
                    : "-"}
                </strong>
              </li>
              <li>
                <span>Stop</span>
                <strong>
                  {Number.isFinite(toFinite(selectedTrade.stopLoss))
                    ? toFinite(selectedTrade.stopLoss)
                    : "-"}
                </strong>
              </li>
              <li>
                <span>Take profit</span>
                <strong>
                  {Number.isFinite(toFinite(selectedTrade.takeProfit))
                    ? toFinite(selectedTrade.takeProfit)
                    : "-"}
                </strong>
              </li>
              <li>
                <span>Planned R:R</span>
                <strong>
                  {Number.isFinite(toFinite(selectedTrade.plannedRR))
                    ? toFinite(selectedTrade.plannedRR).toFixed(2)
                    : "-"}
                </strong>
              </li>
              <li>
                <span>Net R</span>
                <strong>
                  {Number.isFinite(toFinite(selectedTrade.rrAchieved))
                    ? toFinite(selectedTrade.rrAchieved).toFixed(2)
                    : "-"}R
                </strong>
              </li>
              <li>
                <span>Risk %</span>
                <strong>
                  {Number.isFinite(toFinite(selectedTrade.riskPercent))
                    ? `${toFinite(selectedTrade.riskPercent).toFixed(2)}%`
                    : "-"}
                </strong>
              </li>
              <li>
                <span>Lot size</span>
                <strong>
                  {Number.isFinite(toFinite(selectedTrade.lotSize))
                    ? toFinite(selectedTrade.lotSize)
                    : "-"}
                </strong>
              </li>
              <li>
                <span>Amount risked</span>
                <strong>{selectedTradeImpact ? formatCurrency(selectedTradeImpact.riskAmount) : "-"}</strong>
              </li>
              <li>
                <span>Account P/L</span>
                <strong>
                  {selectedTradeImpact
                    ? `${selectedTradeImpact.pnlAmount >= 0 ? "+" : "-"}${formatCurrency(Math.abs(selectedTradeImpact.pnlAmount))}`
                    : "-"}
                </strong>
              </li>
              <li>
                <span>Account impact</span>
                <strong>{selectedTradeImpact ? `${selectedTradeImpact.pnlPercent >= 0 ? "+" : ""}${selectedTradeImpact.pnlPercent}%` : "-"}</strong>
              </li>
              <li>
                <span>Balance after</span>
                <strong>{selectedTradeImpact ? formatCurrency(selectedTradeImpact.balanceAfter) : "-"}</strong>
              </li>
              <li>
                <span>Source</span>
                <strong>{selectedTrade.automation?.source || selectedTrade.importSource || "manual"}</strong>
              </li>
              <li>
                <span>Status</span>
                <strong>{selectedTrade.automation?.status || "closed"}</strong>
              </li>
              <li>
                <span>Scale-ins</span>
                <strong>{toNumber(selectedTrade.lifecycle?.scaleInCount, 0)}</strong>
              </li>
              <li>
                <span>Scale-outs</span>
                <strong>{toNumber(selectedTrade.lifecycle?.scaleOutCount, 0)}</strong>
              </li>
              <li>
                <span>Partial closes</span>
                <strong>{toNumber(selectedTrade.lifecycle?.partialCloseCount, 0)}</strong>
              </li>
              <li>
                <span>Exit reason</span>
                <strong>{selectedTrade.lifecycle?.exitReason || "-"}</strong>
              </li>
            </ul>

            <div className="mt-3 flex flex-wrap gap-2">
              {selectedTrade.tags?.asiaHighLowUsed ? <span className="chip">Asia HL</span> : null}
              {selectedTrade.tags?.pocInteraction ? <span className="chip">POC</span> : null}
              {selectedTrade.tags?.cleanSetup ? <span className="chip">Clean</span> : null}
              {selectedTrade.tags?.pocOutcome ? <span className="chip">{selectedTrade.tags.pocOutcome}</span> : null}
              {selectedTrade.lifecycle?.movedStopToBreakeven ? <span className="chip">Moved to BE</span> : null}
              {selectedTrade.lifecycle?.trailingStopUsed ? <span className="chip">Trailing stop</span> : null}
              {selectedTradeJournalLabels.map((label) => (
                <span key={`journal-label-${label}`} className="chip">
                  {label}
                </span>
              ))}
              {Array.isArray(selectedTrade.mistakeTags)
                ? selectedTrade.mistakeTags.map((tag) => (
                    <span key={`mistake-${tag}`} className="chip">
                      {tag}
                    </span>
                  ))
                : null}
              {Array.isArray(selectedTrade.qualityFlags)
                ? selectedTrade.qualityFlags.slice(0, 6).map((flag) => (
                    <span key={`qf-${flag}`} className="chip">
                      {flag}
                    </span>
                  ))
                : null}
            </div>

            {selectedTrade.ruleBreakReason ? (
              <div className="saas-note-card mt-3">
                <p className="text-xs uppercase tracking-wide text-textMuted">Rule Break Reason</p>
                <p className="mt-2 text-sm text-textMain whitespace-pre-wrap">{selectedTrade.ruleBreakReason}</p>
              </div>
            ) : null}

            {selectedTrade.notes?.priceAction || selectedTrade.notes?.executionReview || selectedTrade.notes?.emotionalState ? (
              <div className="saas-note-card mt-3">
                <p className="text-xs uppercase tracking-wide text-textMuted">Notes</p>
                {selectedTrade.notes?.priceAction ? (
                  <p className="mt-2 text-sm text-textMain whitespace-pre-wrap">{selectedTrade.notes.priceAction}</p>
                ) : null}
                {selectedTrade.notes?.executionReview ? (
                  <p className="mt-2 text-sm text-textMain whitespace-pre-wrap">{selectedTrade.notes.executionReview}</p>
                ) : null}
                {selectedTrade.notes?.emotionalState ? (
                  <p className="mt-2 text-sm text-textMain">Emotion: {selectedTrade.notes.emotionalState}</p>
                ) : null}
              </div>
            ) : null}

            {selectedTrade.automation?.screenRecordingUrl ? (
              <div className="saas-note-card mt-3">
                <p className="text-xs uppercase tracking-wide text-textMuted">Recording</p>
                <a
                  className="mt-2 inline-flex text-sm font-semibold text-accent hover:underline"
                  href={selectedTrade.automation.screenRecordingUrl}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open recording
                </a>
              </div>
            ) : null}

            {selectedTrade.screenshots?.before || selectedTrade.screenshots?.after ? (
              <div className="saas-note-card mt-3">
                <p className="text-xs uppercase tracking-wide text-textMuted">Screenshots</p>
                <div className="saas-trade-media mt-3">
                  {selectedTrade.screenshots?.before ? (
                    <figure className="saas-trade-media-item">
                      <img src={selectedTrade.screenshots.before} alt="Entry screenshot" loading="lazy" />
                      <figcaption className="saas-stat-label mt-2">Entry</figcaption>
                    </figure>
                  ) : null}
                  {selectedTrade.screenshots?.after ? (
                    <figure className="saas-trade-media-item">
                      <img src={selectedTrade.screenshots.after} alt="Exit screenshot" loading="lazy" />
                      <figcaption className="saas-stat-label mt-2">Exit</figcaption>
                    </figure>
                  ) : null}
                </div>
              </div>
            ) : null}

            <div className="saas-settings-actions mt-4">
              <button type="button" className="btn-primary" onClick={() => setSelectedTrade(null)}>
                Close
              </button>
              {selectedTrade?.screenshots?.before || selectedTrade?.screenshots?.after ? (
                <button
                  type="button"
                  className="landing-cta-secondary"
                  onClick={() =>
                    openInspectView(selectedTrade, selectedTrade?.screenshots?.before ? "before" : "after")
                  }
                >
                  Inspect Screenshots
                </button>
              ) : null}
              <button
                type="button"
                className="landing-cta-secondary"
                onClick={() => void copyTradeSummary(selectedTrade)}
              >
                Copy Summary
              </button>
              <button
                type="button"
                className="landing-cta-secondary"
                onClick={() => {
                  setSelectedTrade(null);
                  setReviewRange("all");
                  setActivePage("review");
                }}
              >
                View in Review
              </button>
            </div>
          </div>
        </aside>
      </div>
    ) : null}
  </section>
  );
};

export default SaasWorkspace;




