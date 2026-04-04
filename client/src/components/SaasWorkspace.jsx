import { useEffect, useMemo, useState, useCallback } from "react";
import {
  createWeeklyReviewShare,
  listWeeklyReviewShares,
  revokeWeeklyReviewShare,
} from "../api/tradesApi";
import ThemeToggle from "./ThemeToggle";
import BrandLogo from "./BrandLogo";
import ScreenshotReplay from "./ScreenshotReplay";
import { PAIRS } from "../utils/options";

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
  replay: "review",
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
  const navGroups = ["Core", "Review", "Setup"].map((group) => ({
    group,
    pages: navPages.filter((page) => page.group === group),
  }));
  const mobileNavGroups = ["Core", "Review", "Setup"].map((group) => ({
    group,
    pages: mobilePrimaryPages.filter((page) => page.group === group),
  }));
  const mobileLabelMap = {
    dashboard: "Dashboard",
    journal: "Add Trade",
    analytics: "Analytics",
    edge: "Edge",
    behavior: "Behavior",
    review: "Review",
    coaching: "Coaching",
    replay: "Replay",
    playbooks: "Playbooks",
    risk: "Risk",
    settings: "Settings",
  };
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [newProfileName, setNewProfileName] = useState("");
  const [newProfileAccountSize, setNewProfileAccountSize] = useState("");
  const [selectedTrade, setSelectedTrade] = useState(null);
  const [tradeDetailReturnPage, setTradeDetailReturnPage] = useState("review");
  const [reviewReplayTarget, setReviewReplayTarget] = useState("");
  const [tradeDetailsBusy, setTradeDetailsBusy] = useState(false);
  const [tradeDetailsError, setTradeDetailsError] = useState("");
  const [settingsDraft, setSettingsDraft] = useState({
    profileName: "",
    profileDescription: "",
    pairs: "",
    sessions: "",
    setupTypes: "",
    playbooksJson: "",
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
      playbooksJson: JSON.stringify(safePlaybooks, null, 2),
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
  const activeAccountPerformance = useMemo(
    () => computeAccountPerformance(allTrades, activeProfileAccountSize),
    [activeProfileAccountSize, allTrades]
  );
  const accountTimeline = useMemo(
    () => buildAccountTimeline(allTrades, activeProfileAccountSize),
    [activeProfileAccountSize, allTrades]
  );
  const accountImpactByTradeId = accountTimeline.impactByTradeId;
  const accountBalancePolyline = useMemo(() => buildPolyline(accountTimeline.points), [accountTimeline.points]);
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
      progressPercent: Math.min(Math.max((drawdownPercent / maxDailyDrawdownPercent) * 100, 0), 100),
      breached: drawdownPercent >= maxDailyDrawdownPercent,
    };
  }, [dailyAccountPerformance, maxDailyDrawdownPercent]);

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

    let parsedPlaybooks = [];
    try {
      const raw = JSON.parse(settingsDraft.playbooksJson || "[]");
      parsedPlaybooks = Array.isArray(raw) ? raw : [];
    } catch {
      window.alert("Playbooks JSON is invalid. Fix the JSON before saving settings.");
      return;
    }

    void handleUpdateUserSettings({
      options: {
        pairs: nextPairs,
        sessions: fromCsv(settingsDraft.sessions),
        setupTypes: fromCsv(settingsDraft.setupTypes),
      },
      playbooks: parsedPlaybooks,
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
          <span>Journex</span>
        </div>
        <nav className="saas-nav">
          {navGroups.map((group) => (
            <div key={`nav-group-${group.group}`} className="saas-nav-group">
              <p className="saas-nav-group-label">{group.group}</p>
              <div className="saas-nav-group-items">
                {group.pages.map((page) => (
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
              </div>
            </div>
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
          {mobileNavGroups.map((group) => (
            <div key={`drawer-group-${group.group}`} className="saas-nav-group">
              <p className="saas-nav-group-label">{group.group}</p>
              <div className="saas-nav-group-items">
                {group.pages.map((page) => (
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
              </div>
            </div>
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

      <div className="saas-topbar">
        <div className="saas-topbar-left">
          <span className={`saas-status-dot ${isOnline ? "" : "saas-status-dot-offline"}`} aria-hidden="true" />
          <span>{isOnline ? "Online" : "Offline mode"}</span>
          {offlineQueue.length ? <span className="chip">{offlineQueue.length} queued</span> : null}
          {deferredInstallPrompt ? (
            <button type="button" className="chip quick-chart-btn" onClick={() => void handleInstallApp()}>
              Install App
            </button>
          ) : null}
        </div>
        <div className="saas-topbar-right">
          <div className="saas-user-card">
            <div className="saas-user-avatar">{userInitials}</div>
            <div className="saas-user-meta">
              <strong>{user?.name || "Trader"}</strong>
              <span>{user?.email || "Active account"}</span>
            </div>
          </div>
        </div>
      </div>

      <header className="saas-page-header">
        <div>
          <div className="saas-breadcrumb" aria-label="Breadcrumb">
            {breadcrumbItems.map((item, index) => (
              <span key={`crumb-${item}-${index}`} className="saas-breadcrumb-item">
                {index > 0 ? <span className="saas-breadcrumb-sep">/</span> : null}
                <span>{item}</span>
              </span>
            ))}
          </div>
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

      {groupPages.length > 1 ? (
        <section className="panel saas-section-switcher" aria-label={`${activeGroup} pages`}>
          <div className="saas-section-switcher-head">
            <strong>{activeGroup}</strong>
            <span>{activePage === "trade-detail" ? "Return flow stays inside this section." : "Quickly move between related pages."}</span>
          </div>
          <div className="saas-section-switcher-tabs">
            {groupPages.map((page) => {
              const isCurrent =
                activePage === page.key || (activePage === "trade-detail" && tradeDetailReturnPage === page.key);
              return (
                <button
                  key={`section-switch-${page.key}`}
                  type="button"
                  className={`saas-section-tab ${isCurrent ? "saas-section-tab-active" : ""}`}
                  onClick={() => setActivePage(page.key)}
                  aria-current={isCurrent ? "page" : undefined}
                >
                  {page.label}
                </button>
              );
            })}
          </div>
        </section>
      ) : null}

      <section className="panel saas-profile-rail">
        <div className="saas-profile-rail-copy">
          <span className="chip">Active profile</span>
          <strong>{activeProfile?.name || "Main Profile"}</strong>
          <span>
            {activeProfileAccountSize > 0
              ? `${formatAccountSize(activeProfileAccountSize)} starting balance`
              : "Set account size in Settings to unlock real risk and growth tracking."}
          </span>
        </div>
        <div className="saas-profile-rail-actions">
          <select
            className="input saas-profile-select"
            value={filters.profileId || user.activeProfileId || ""}
            onChange={(event) => handleProfileSwitch(event.target.value)}
          >
            {(user.profiles || []).map((profile) => (
              <option key={profile.id} value={profile.id}>
                {profile.name}
              </option>
            ))}
          </select>
          <div className="saas-profile-chip-row">
            {(user.profiles || []).slice(0, 4).map((profile) => (
              <button
                key={`profile-chip-${profile.id}`}
                type="button"
                className={`chip-btn ${(filters.profileId || user.activeProfileId) === profile.id ? "chip-btn-active" : ""}`}
                onClick={() => handleProfileSwitch(profile.id)}
              >
                {profile.name}
              </button>
            ))}
          </div>
        </div>
      </section>

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
          <div className="saas-insights-row">
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Best setup</p>
              <h3>{resolvedSetupTop[0]?.label || "-"}</h3>
              <p className="saas-stat-label">
                {resolvedSetupTop[0]
                  ? `${resolvedSetupTop[0].winRate}% win rate | ${topSetupConfidence.label}`
                  : "Start logging trades to reveal your edge"}
              </p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Best session</p>
              <h3>{resolvedSessionTop[0]?.label || "-"}</h3>
              <p className="saas-stat-label">
                {resolvedSessionTop[0]
                  ? `${resolvedSessionTop[0].winRate}% win rate | ${topSessionConfidence.label}`
                  : "Session performance appears after more trades"}
              </p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Most consistent</p>
              <h3>{followedPlanWinRate ? `${followedPlanWinRate}%` : "-"}</h3>
              <p className="saas-stat-label">
                {resolvedFollowedPlanTrades.length
                  ? `${resolvedFollowedPlanTrades.length} clean trades`
                  : "Track clean setups to measure discipline"}
              </p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Account return</p>
              <h3>
                {activeAccountPerformance
                  ? `${activeAccountPerformance.returnPercent >= 0 ? "+" : ""}${activeAccountPerformance.returnPercent}%`
                  : "Set size"}
              </h3>
              <p className="saas-stat-label">
                {activeAccountPerformance
                  ? `${formatCurrency(activeAccountPerformance.currentBalance)} current balance`
                  : "Add account size in Settings to unlock balance-based reporting"}
              </p>
            </article>
          </div>
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

          <article className="panel saas-card saas-account-panel">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Profile Performance</h3>
                <p className="saas-card-subtitle">
                  {activeProfile?.name || "Active profile"} performance translated into account growth using your saved risk % per trade.
                </p>
              </div>
              {activeAccountPerformance ? <span className="chip">{activeAccountPerformance.trackedTrades} risk-tracked trades</span> : null}
            </div>
            {activeAccountPerformance ? (
              <div className="saas-account-grid">
                <div className="saas-metric-item">
                  <span>Start Balance</span>
                  <strong>{formatCurrency(activeAccountPerformance.startingBalance)}</strong>
                </div>
                <div className="saas-metric-item">
                  <span>Estimated P/L</span>
                  <strong>
                    {activeAccountPerformance.pnlAmount >= 0 ? "+" : "-"}
                    {formatCurrency(Math.abs(activeAccountPerformance.pnlAmount))}
                  </strong>
                </div>
                <div className="saas-metric-item">
                  <span>Current Balance</span>
                  <strong>{formatCurrency(activeAccountPerformance.currentBalance)}</strong>
                </div>
                <div className="saas-metric-item">
                  <span>Max Drawdown</span>
                  <strong>
                    -{activeAccountPerformance.maxDrawdownPercent}% ({formatCurrency(activeAccountPerformance.maxDrawdownAmount)})
                  </strong>
                </div>
              </div>
            ) : (
              <div className="saas-risk-panel saas-risk-panel-muted">
                Add an account size to the active profile in Settings so Journex can convert R-multiple performance into estimated balance growth and drawdown.
              </div>
            )}
          </article>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Account Goals</h3>
                <p className="saas-card-subtitle">Daily and weekly targets based on the active profile's saved account size.</p>
              </div>
            </div>
            {activeProfileAccountSize > 0 ? (
              <div className="saas-metric-list">
                <div className="saas-metric-item">
                  <span>Daily profit target</span>
                  <strong>
                    {dailyGoalProgress
                      ? `${dailyGoalProgress.currentPercent >= 0 ? "+" : ""}${dailyGoalProgress.currentPercent}% / ${dailyGoalProgress.targetPercent}%`
                      : "Not set"}
                  </strong>
                </div>
                <div className="saas-progress saas-progress-green">
                  <span style={{ width: `${dailyGoalProgress?.progressPercent || 0}%` }} />
                </div>
                <div className="saas-metric-item">
                  <span>Weekly profit target</span>
                  <strong>
                    {weeklyGoalProgress
                      ? `${weeklyGoalProgress.currentPercent >= 0 ? "+" : ""}${weeklyGoalProgress.currentPercent}% / ${weeklyGoalProgress.targetPercent}%`
                      : "Not set"}
                  </strong>
                </div>
                <div className="saas-progress saas-progress-blue">
                  <span style={{ width: `${weeklyGoalProgress?.progressPercent || 0}%` }} />
                </div>
                <div className="saas-metric-item">
                  <span>Daily drawdown cap</span>
                  <strong>
                    {dailyDrawdownProgress
                      ? `${dailyDrawdownProgress.currentPercent}% / ${dailyDrawdownProgress.capPercent}%`
                      : "Not set"}
                  </strong>
                </div>
                <div className="saas-progress saas-progress-red">
                  <span style={{ width: `${dailyDrawdownProgress?.progressPercent || 0}%` }} />
                </div>
                <p className="saas-metric-note">
                  {dailyDrawdownProgress?.breached
                    ? "Daily drawdown limit breached. Step back and review before taking another trade."
                    : "Goal progress updates from risk-adjusted performance on this profile."}
                </p>
              </div>
            ) : (
              <div className="saas-risk-panel saas-risk-panel-muted">
                Save an account size first, then Journex will track progress against your daily and weekly account goals.
              </div>
            )}
          </article>

          <div className="saas-main-grid">
            <article className="panel saas-card">
              <div className="saas-card-head">
                <div>
                  <h3 className="saas-card-title">Playbook Performance</h3>
                  <p className="saas-card-subtitle">See which saved playbooks actually hold up in live execution.</p>
                </div>
              </div>
              {playbookStats.length ? (
                <div className="saas-ranking-list">
                  {playbookStats.slice(0, 4).map((item) => (
                    <div key={`playbook-${item.label}`} className="saas-ranking-item">
                      <div className="saas-ranking-top">
                        <strong>{item.label}</strong>
                        <span className="saas-rank-rate">{item.winRate}%</span>
                      </div>
                      <div className="saas-ranking-sub">
                        <p>{item.trades} trades</p>
                        <p>Avg R:R {toNumber(item.avgRR).toFixed(2)}x</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="saas-risk-panel saas-risk-panel-muted">
                  Save playbooks in Settings and attach them in Add Trade to compare live execution against your playbook library.
                </div>
              )}
            </article>

            <article className="panel saas-card">
              <div className="saas-card-head">
                <div>
                  <h3 className="saas-card-title">Costly Mistakes</h3>
                  <p className="saas-card-subtitle">The behaviors currently taking the most R off the table.</p>
                </div>
              </div>
              {mistakeStats.length ? (
                <div className="saas-ranking-list">
                  {mistakeStats.slice(0, 4).map((item) => (
                    <div key={`mistake-cost-${item.label}`} className="saas-ranking-item">
                      <div className="saas-ranking-top">
                        <strong>{item.label}</strong>
                        <span className="saas-rank-rate saas-rank-rate-low">-{item.costRR}R</span>
                      </div>
                      <div className="saas-ranking-sub">
                        <p>{item.trades} tagged trades</p>
                        <p>{item.losses} losses linked to this leak</p>
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="saas-risk-panel saas-risk-panel-muted">
                  Turn on the mistake tracker in your trade workflow to see which habits need the most attention.
                </div>
              )}
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
                Best session: <span>{resolvedEdgeInsights.bestSession?.key || "N/A"}</span>
                {resolvedEdgeInsights.bestSession?.winRate !== undefined ? (
                  <span> ({resolvedEdgeInsights.bestSession.winRate}% WR)</span>
                ) : null}
                {resolvedEdgeInsights.bestSetup?.key ? (
                  <>
                    . Best setup: <span>{resolvedEdgeInsights.bestSetup.key}</span>.
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
              {accountTimeline.points.length > 1 ? (
                <>
                  <div className="saas-card-head mt-4">
                    <div>
                      <h3 className="saas-card-title">Profile Equity Curve</h3>
                      <p className="saas-card-subtitle">Estimated account balance using saved risk % per trade.</p>
                    </div>
                    <span className="chip text-textMain">{formatCurrency(activeAccountPerformance?.currentBalance)}</span>
                  </div>
                  <svg viewBox="0 0 640 220" className="saas-line-chart saas-line-chart-account" aria-hidden="true">
                    <polyline
                      points={accountBalancePolyline}
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                </>
              ) : null}
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
                  <strong>{round(Math.abs(toNumber(resolvedEdgeInsights.maxDrawdown)), 2)}R</strong>
                </div>
                <div className="saas-progress saas-progress-red">
                  <span style={{ width: `${Math.min(Math.max(Math.abs(toNumber(resolvedEdgeInsights.maxDrawdown)) * 30, 0), 100)}%` }} />
                </div>
                <div className="saas-metric-item">
                  <span>Worst Habit</span>
                  <strong>{resolvedEdgeInsights.worstHabit?.title || "None"}</strong>
                </div>
                {resolvedEdgeInsights.worstHabit?.detail ? (
                  <p className="saas-metric-note">{resolvedEdgeInsights.worstHabit.detail}</p>
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
        <section className="space-y-4 saas-page-section saas-page-journal">
          <button type="button" className="saas-back-link" onClick={() => setActivePage("dashboard")}>
            <span aria-hidden="true">&lt;</span> Back to Dashboard
          </button>
          <section className="panel saas-section-switcher">
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

            <details className="saas-collapsible">
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

            <div
              className={`saas-risk-panel ${
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

            <div className="saas-form-grid">
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
          <div className="saas-insights-row saas-insights-row-analytics">
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Best pair</p>
              <h3>{pairRankings[0]?.label || "-"}</h3>
              <p className="saas-stat-label">
                {pairRankings[0]
                  ? `${pairRankings[0].winRate}% win rate across ${pairRankings[0].trades} trades`
                  : "Pair rankings unlock after more trade history"}
              </p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Top session</p>
              <h3>{resolvedSessionTop[0]?.label || "-"}</h3>
              <p className="saas-stat-label">
                {resolvedSessionTop[0]
                  ? `${resolvedSessionTop[0].avgRR.toFixed(2)}x average R:R`
                  : "Session quality appears once trades are logged"}
              </p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Monthly pace</p>
              <h3>
                {monthNetRR >= 0 ? "+" : "-"}
                {Math.abs(monthNetRR).toFixed(2)}R
              </h3>
              <p className="saas-stat-label">{monthLabel}</p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Account drawdown</p>
              <h3>
                {activeAccountPerformance ? `-${activeAccountPerformance.maxDrawdownPercent}%` : "Set size"}
              </h3>
              <p className="saas-stat-label">
                {activeAccountPerformance
                  ? `${formatCurrency(activeAccountPerformance.maxDrawdownAmount)} peak-to-trough`
                  : "Add account size to convert RR into drawdown by profile"}
              </p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Account return</p>
              <h3>
                {activeAccountPerformance
                  ? `${activeAccountPerformance.returnPercent >= 0 ? "+" : ""}${activeAccountPerformance.returnPercent}%`
                  : "Set size"}
              </h3>
              <p className="saas-stat-label">
                {activeAccountPerformance
                  ? `${formatCurrency(activeAccountPerformance.currentBalance)} estimated balance`
                  : "Save account size to unlock balance-based reporting"}
              </p>
            </article>
          </div>

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
              <div className="saas-section-header">
                <span className="saas-stat-icon saas-stat-icon-blue">
                  <IconGlyph name="analytics" />
                </span>
                <div>
                  <h3 className="saas-card-title">Performance by Setup</h3>
                  <p className="saas-card-subtitle">Compare setup quality using win rate across your top patterns.</p>
                </div>
              </div>
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
              <div className="saas-section-header">
                <span className="saas-stat-icon saas-stat-icon-violet">
                  <IconGlyph name="calendar" />
                </span>
                <div>
                  <h3 className="saas-card-title">Performance by Session</h3>
                  <p className="saas-card-subtitle">See where your edge shows up with the most consistency.</p>
                </div>
              </div>
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
              <div className="saas-section-header">
                <span className="saas-stat-icon saas-stat-icon-green">
                  <IconGlyph name="win" />
                </span>
                <div>
                  <h3 className="saas-card-title">Trade Outcomes</h3>
                  <p className="saas-card-subtitle">Distribution of wins, losses, and break-even trades.</p>
                </div>
              </div>
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
              <div className="saas-section-header">
                <span className="saas-stat-icon saas-stat-icon-gold">
                  <IconGlyph name="money" />
                </span>
                <div>
                  <h3 className="saas-card-title">This Month</h3>
                  <p className="saas-card-subtitle">How the current month is pacing against your recent baseline.</p>
                </div>
              </div>
              <p className="saas-stat-value">
                {monthNetRR >= 0 ? "+" : "-"}
                {Math.abs(monthNetRR).toFixed(2)}R
              </p>
              <p className="saas-stat-label">Net R</p>
            </article>
            <article className="panel saas-card">
              <div className="saas-section-header">
                <span className="saas-stat-icon saas-stat-icon-blue">
                  <IconGlyph name="pulse" />
                </span>
                <div>
                  <h3 className="saas-card-title">Profile Equity</h3>
                  <p className="saas-card-subtitle">Estimated balance growth for the active profile.</p>
                </div>
              </div>
              {accountTimeline.points.length > 1 ? (
                <>
                  <svg viewBox="0 0 640 220" className="saas-line-chart saas-line-chart-account" aria-hidden="true">
                    <polyline
                      points={accountBalancePolyline}
                      fill="none"
                      stroke="#22c55e"
                      strokeWidth="4"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                  <p className="saas-stat-label mt-3">
                    {formatCurrency(activeAccountPerformance?.startingBalance)} to {formatCurrency(activeAccountPerformance?.currentBalance)}
                  </p>
                </>
              ) : (
                <div className="saas-risk-panel saas-risk-panel-muted">
                  Save an account size to unlock equity-by-profile analytics.
                </div>
              )}
            </article>
          </div>
        </section>
      ) : null}

      {activePage === "edge" ? (
        <section className="space-y-4 saas-page-section saas-page-edge">
          <article className="panel saas-edge-banner saas-edge-banner-primary">
            <div className="saas-banner-head">
              <span className="saas-stat-icon saas-stat-icon-blue">
                <IconGlyph name="pulse" />
              </span>
              <h3>Your Trading Edge</h3>
            </div>
            <p>
              Best Setup: <span>{resolvedSetupTop[0]?.label || "N/A"}</span> ({resolvedSetupTop[0]?.winRate ?? 0}% WR)
              <span className="ml-3">Best Session: {resolvedSessionTop[0]?.label || "N/A"} ({resolvedSessionTop[0]?.winRate ?? 0}% WR)</span>
            </p>
            <p className="saas-stat-label">
              Confidence: setup {topSetupConfidence.label.toLowerCase()} | session {topSessionConfidence.label.toLowerCase()}
            </p>
          </article>

          {!totalTrades ? (
            <article className="saas-alert">
              Log a few closed trades to unlock edge rankings and signals.
            </article>
          ) : null}

          <div className="saas-stats-grid saas-stats-grid-primary">
            <article className="panel saas-card">
              <div className="saas-stat-head">
                <span className="saas-stat-icon saas-stat-icon-violet">
                  <IconGlyph name="rr" />
                </span>
                <p className="saas-stat-kicker">RR per trade</p>
              </div>
              <p className="saas-stat-value">
                {expectancyValue >= 0 ? "+" : "-"}
                {Math.abs(toNumber(expectancyValue)).toFixed(2)}R
              </p>
              <p className="saas-stat-label">Expectancy</p>
            </article>
            <article className="panel saas-card">
              <div className="saas-stat-head">
                <span className="saas-stat-icon saas-stat-icon-green">
                  <IconGlyph name="money" />
                </span>
                <p className="saas-stat-kicker">Cumulative</p>
              </div>
              <p className="saas-stat-value">
                {toNumber(resolvedEdgeInsights?.equityNow) >= 0 ? "+" : "-"}
                {Math.abs(toNumber(resolvedEdgeInsights?.equityNow)).toFixed(2)}R
              </p>
              <p className="saas-stat-label">Equity</p>
            </article>
            <article className="panel saas-card">
              <div className="saas-stat-head">
                <span className="saas-stat-icon saas-stat-icon-red">
                  <IconGlyph name="warn" />
                </span>
                <p className="saas-stat-kicker">Peak to trough</p>
              </div>
              <p className="saas-stat-value">
                {Math.abs(toNumber(resolvedEdgeInsights?.maxDrawdown)) > 0
                  ? `-${Math.abs(toNumber(resolvedEdgeInsights?.maxDrawdown)).toFixed(2)}R`
                  : "0.00R"}
              </p>
              <p className="saas-stat-label">Max drawdown</p>
            </article>
            <article className="panel saas-card">
              <div className="saas-stat-head">
                <span className="saas-stat-icon saas-stat-icon-blue">
                  <IconGlyph name="calendar" />
                </span>
                <p className="saas-stat-kicker">Last 7 days</p>
              </div>
              <p className="saas-stat-value">{weeklyTrades?.length || 0}</p>
              <p className="saas-stat-label">Trades this week</p>
            </article>
          </div>

          {resolvedEdgeInsights?.worstHabit ? (
            <article className="panel saas-card">
              <h3 className="saas-card-title">Leak To Fix</h3>
              <p className="text-sm font-semibold text-textMain">{resolvedEdgeInsights.worstHabit.title}</p>
              <p className="saas-stat-label mt-2">{resolvedEdgeInsights.worstHabit.detail}</p>
            </article>
          ) : null}

          {resolvedEdgeInsights?.notifications?.length ? (
            <article className="panel saas-card">
              <h3 className="saas-card-title">Signals</h3>
              <ul className="saas-signal-list">
                {resolvedEdgeInsights.notifications.map((note) => (
                  <li
                    key={note.id}
                    className={`saas-signal ${note.level === "warn" ? "saas-signal-warn" : "saas-signal-info"}`}
                  >
                    {note.message}
                  </li>
                ))}
              </ul>
            </article>
          ) : null}

          <div className="saas-main-grid">
            <article className="panel saas-card">
              <h3 className="saas-card-title">Setup Rankings</h3>
              <div className="saas-ranking-list">
                {resolvedSetupTop.map((item, index) => (
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
                        Avg R:R {toNumber(item.avgRR).toFixed(2)}x | {confidenceForSample(item.trades).label}
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
                {resolvedSessionTop.map((item, index) => (
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
                        Avg R:R {toNumber(item.avgRR).toFixed(2)}x | {confidenceForSample(item.trades).label}
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
        <section className="space-y-4 saas-page-section saas-page-behavior">
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
                    totalTrades ? (resolvedFollowedPlanTrades.length / totalTrades) * 100 : 0
                  }%, #ef4444 0 100%)`,
                }}
              />
              <div className="saas-behavior-summary">
                <div className="saas-behavior-mini saas-behavior-mini-good">
                  <p>Followed</p>
                  <strong>{resolvedFollowedPlanTrades.length}</strong>
                </div>
                <div className="saas-behavior-mini saas-behavior-mini-bad">
                  <p>Violated</p>
                  <strong>{resolvedViolatedPlanTrades.length}</strong>
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
              {resolvedEmotionTop.map((item) => (
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

          <article className="panel saas-card">
            <div className="saas-section-header">
              <span className="saas-stat-icon saas-stat-icon-blue">
                <IconGlyph name="calendar" />
              </span>
              <div>
                <h3 className="saas-card-title">{activeReview.title}</h3>
                <p className="saas-card-subtitle">A focused snapshot of what improved, what slipped, and what to revisit.</p>
              </div>
            </div>
            <div className="saas-stats-grid">
              <article className="saas-mini-stat"><p>Total Trades</p><strong>{activeReviewTrades.length}</strong></article>
              <article className="saas-mini-stat"><p>Win Rate</p><strong>{activeReview.winRate}%</strong></article>
              <article className="saas-mini-stat"><p>Avg R:R</p><strong>{activeReview.avgRR}x</strong></article>
              <article className="saas-mini-stat saas-mini-stat-profit"><p>Net R</p><strong>{activeReviewNetRR >= 0 ? "+" : "-"}{Math.abs(activeReviewNetRR).toFixed(2)}R</strong></article>
            </div>
            <div className="saas-stats-grid mt-3">
              <article className="saas-mini-stat">
                <p>Discipline</p>
                <strong>{reviewScores.discipline}%</strong>
              </article>
              <article className="saas-mini-stat">
                <p>Risk Control</p>
                <strong>{reviewScores.riskControl}%</strong>
              </article>
              <article className="saas-mini-stat">
                <p>Execution</p>
                <strong>{reviewScores.execution}%</strong>
              </article>
              <article className="saas-mini-stat saas-mini-stat-profit">
                <p>Review Grade</p>
                <strong>{reviewScores.grade}</strong>
              </article>
            </div>
            {!activeReviewTrades.length ? (
              <div className="saas-empty-state mt-3">
                <strong>No closed trades yet</strong>
                <p>Nothing is available for the {activeReview.label.toLowerCase()} review range yet. Log a few closed trades and Journex will build the summary here.</p>
              </div>
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

          <div className="saas-insights-row saas-insights-row-review">
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Replay coverage</p>
              <h3>{reviewScreenshotCoverage}%</h3>
              <p className="saas-stat-label">{reviewTradesWithScreenshots} trades include screenshots in this range.</p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Review focus</p>
              <h3>{reviewWorstSetup?.label || "Hold steady"}</h3>
              <p className="saas-stat-label">
                {reviewWorstSetup
                  ? `${reviewWorstSetup.winRate}% win rate, ${reviewWorstSetup.trades} trades`
                  : "No weak setup identified in this period"}
              </p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Best execution</p>
              <h3>{activeBestTrade?.pair || "-"}</h3>
              <p className="saas-stat-label">
                {activeBestTrade
                  ? `${toNumber(activeBestTrade.rrAchieved).toFixed(2)}R on ${formatTradeDate(activeBestTrade.tradeDate)}`
                  : "Best trade appears once trades are logged"}
              </p>
            </article>
          </div>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Review Coach</h3>
                <p className="saas-card-subtitle">Keep the main review page lighter and open coaching only when you need it.</p>
              </div>
              <span className="chip text-textMain">Assistant</span>
            </div>
            <div className="saas-main-grid mt-4">
              <div className="saas-note-card">
                <h4>Current focus</h4>
                <p className="saas-stat-label mt-2">{coachingSummary.assistant}</p>
                <p className="saas-stat-label mt-2">
                  {reviewMistakeStats.length
                    ? `${reviewMistakeStats[0].label} is still the biggest leak in this range.`
                    : "Once you tag mistakes, coaching will pinpoint the biggest leak here."}
                </p>
              </div>
              <div className="saas-note-card">
                <h4>Next step</h4>
                <p className="saas-stat-label mt-2">Open the dedicated coaching page to see keep, stop, and test guidance without crowding review.</p>
                <div className="saas-settings-actions mt-3">
                  <button type="button" className="btn-primary" onClick={() => setActivePage("coaching")}>
                    Open Coaching
                  </button>
                </div>
              </div>
            </div>
          </article>

          <div className="saas-insights-row">
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Replay workspace</p>
              <h3>{replayTrades.length}</h3>
              <p className="saas-stat-label">
                {replayTrade
                  ? `Current replay focus: ${replayTrade.pair || "-"} ${replayTrade.setupType || ""}`.trim()
                  : "No replay-ready trades in this range yet."}
              </p>
              <div className="saas-settings-actions mt-3">
                <button type="button" className="btn-primary" onClick={() => setActivePage("replay")}>
                  Open Replay
                </button>
              </div>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Calendar coverage</p>
              <h3>{reviewCalendarDays.length}</h3>
              <p className="saas-stat-label">
                {reviewCalendarDays.length
                  ? `${reviewCalendarDays.length} active review days mapped for this range.`
                  : "Trading days will appear here once this range has activity."}
              </p>
              <div className="saas-settings-actions mt-3">
                <button type="button" className="landing-cta-secondary" onClick={() => setActivePage("replay")}>
                  View Calendar
                </button>
              </div>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Risk + funded</p>
              <h3>{fundedMode.enabled ? fundedMode.provider || "Enabled" : "Off"}</h3>
              <p className="saas-stat-label">
                {fundedProgress
                  ? `${fundedProgress.tradingDays} trading days logged with ${fundedProgress.profitProgress.toFixed(0)}% target progress.`
                  : "Keep risk rules, goals, and funded challenge tracking in one cleaner place."}
              </p>
              <div className="saas-settings-actions mt-3">
                <button type="button" className="landing-cta-secondary" onClick={() => setActivePage("risk")}>
                  Open Risk Center
                </button>
              </div>
            </article>
          </div>

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
                      <th scope="col">Session</th>
                      <th scope="col">Setup</th>
                      <th scope="col">Outcome</th>
                      <th scope="col">R</th>
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
                        <td data-label="Session">{trade.session || "-"}</td>
                        <td data-label="Setup">{trade.setupType || "-"}</td>
                        <td data-label="Outcome">
                          <TradeOutcome result={trade.result} />
                        </td>
                        <td
                          data-label="R"
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
          <div className="saas-insights-row">
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Discipline</p>
              <h3>{reviewScores.discipline}%</h3>
              <p className="saas-stat-label">How consistently you are following the process in the selected review range.</p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Risk control</p>
              <h3>{reviewScores.riskControl}%</h3>
              <p className="saas-stat-label">Risk score built from screenshot coverage, tagging, and saved risk limits.</p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Execution grade</p>
              <h3>{reviewScores.grade}</h3>
              <p className="saas-stat-label">A dedicated page for coaching keeps the main review page clean and faster to scan.</p>
            </article>
          </div>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Review Coach</h3>
                <p className="saas-card-subtitle">Keep, stop, and test next based on the current review range.</p>
              </div>
              <span className="chip text-textMain">Assistant</span>
            </div>
            <div className="saas-coaching-grid mt-4">
              <div className="saas-note-card">
                <h4>Keep</h4>
                <ul className="saas-note-list">
                  {coachingSummary.keep.map((item) => (
                    <li key={`coach-keep-${item}`}>
                      <span><strong>{item}</strong></span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="saas-note-card">
                <h4>Stop</h4>
                <ul className="saas-note-list">
                  {coachingSummary.stop.map((item) => (
                    <li key={`coach-stop-${item}`}>
                      <span><strong>{item}</strong></span>
                    </li>
                  ))}
                </ul>
              </div>
              <div className="saas-note-card">
                <h4>Test Next</h4>
                <ul className="saas-note-list">
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
        </section>
      ) : null}

      {activePage === "replay" ? (
        <section className="space-y-4 saas-page-section saas-page-replay">
          <div className="saas-insights-row">
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Replay trades</p>
              <h3>{replayTrades.length}</h3>
              <p className="saas-stat-label">Chronological screenshot review for the current review range.</p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Screenshot coverage</p>
              <h3>{reviewScreenshotCoverage}%</h3>
              <p className="saas-stat-label">{reviewTradesWithScreenshots} trades have at least one screenshot.</p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Shares</p>
              <h3>{reviewShares.length}</h3>
              <p className="saas-stat-label">Reusable weekly review links live here instead of cluttering Review.</p>
            </article>
          </div>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Replay Controls</h3>
                <p className="saas-card-subtitle">Step trade by trade and open detail pages only when needed.</p>
              </div>
              <span className="chip text-textMain">{replayTradeIndex >= 0 ? replayTradeIndex + 1 : 0}/{replayTrades.length}</span>
            </div>
            <div className="saas-settings-actions mt-3">
              <button
                type="button"
                className="landing-cta-secondary"
                onClick={() => stepReplayTrade(-1)}
                disabled={!replayTrades.length || replayTradeIndex <= 0}
              >
                Prev Trade
              </button>
              <button
                type="button"
                className="landing-cta-secondary"
                onClick={() => stepReplayTrade(1)}
                disabled={!replayTrades.length || replayTradeIndex >= replayTrades.length - 1}
              >
                Next Trade
              </button>
              <button
                type="button"
                className="btn-primary"
                onClick={() => void handleCreateReviewShare()}
                disabled={!isOnline || shareBusy}
              >
                {shareBusy ? "Creating..." : "Create Review Share"}
              </button>
            </div>
            {replayTrade ? (
              <button
                type="button"
                className="saas-note-card mt-3 text-left"
                onClick={() => openTrade(replayTrade)}
              >
                <h4>{replayTrade.pair} - {replayTrade.setupType}</h4>
                <p className="saas-stat-label mt-2">
                  {formatTradeDate(replayTrade.tradeDate)} | {replayTrade.session} | {toNumber(replayTrade.rrAchieved).toFixed(2)}R
                </p>
              </button>
            ) : (
              <div className="saas-empty-state mt-3">
                <strong>No replay trades yet</strong>
                <p>Replay becomes available once the selected review range has saved trades with screenshots or detail to inspect.</p>
              </div>
            )}
            {shareError ? <p className="saas-alert saas-alert-error mt-3">{shareError}</p> : null}
            {shareMessage ? <p className="saas-alert mt-3">{shareMessage}</p> : null}
          </article>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Trading Calendar</h3>
                <p className="saas-card-subtitle">Day-by-day review map that opens trade detail directly.</p>
              </div>
            </div>
            {reviewCalendarDays.length ? (
              <div className="saas-calendar-grid mt-3">
                {reviewCalendarDays.map((day) => (
                  <button
                    key={`replay-calendar-${day.key}`}
                    type="button"
                    className={`saas-calendar-day ${day.netRR > 0 ? "saas-calendar-day-win" : day.netRR < 0 ? "saas-calendar-day-loss" : ""}`}
                    onClick={() => {
                      const match = activeReviewTrades.find(
                        (trade) => String(trade?.tradeDate || "").slice(0, 10) === day.key
                      );
                      if (match) {
                        openTrade(match);
                      }
                    }}
                  >
                    <span>{new Date(day.key).toLocaleDateString([], { month: "short", day: "numeric" })}</span>
                    <strong>{day.trades} trades</strong>
                    <small>{day.netRR >= 0 ? "+" : ""}{day.netRR}R</small>
                  </button>
                ))}
              </div>
            ) : (
              <div className="saas-empty-state mt-3">
                <strong>No calendar activity yet</strong>
                <p>Trading days will appear here automatically once this review range has activity.</p>
              </div>
            )}
          </article>

          <div id="review-screenshot-replay">
            <ScreenshotReplay
              trades={activeReviewTrades}
              selectedTradeId={reviewReplayTarget}
              onSelectTrade={openTradeFromReview}
              onOpenInspect={openInspectView}
            />
          </div>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Review Shares</h3>
                <p className="saas-card-subtitle">Keep share links and revocations in the replay workspace.</p>
              </div>
            </div>
            {loadingReviewShares ? (
              <p className="saas-stat-label mt-3">Loading shares...</p>
            ) : reviewShares.length ? (
              <div className="saas-ranking-list mt-3">
                {reviewShares.map((share) => (
                  <div key={share.id} className="saas-ranking-item">
                    <div className="saas-ranking-top">
                      <strong>{share.title}</strong>
                      <span className="chip">{share.isExpired ? "Expired" : "Live"}</span>
                    </div>
                    <div className="saas-ranking-sub">
                      <p>{share.periodStart} to {share.periodEnd}</p>
                      <p>Expires {formatDateTime(share.expiresAt)}</p>
                    </div>
                    <div className="saas-settings-actions mt-2">
                      <button
                        type="button"
                        className="chip text-textMain"
                        onClick={() => void handleRevokeShare(share.id)}
                      >
                        Revoke
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="saas-empty-state mt-3">
                <strong>No review shares yet</strong>
                <p>Create a review share from this page when you want to send a weekly snapshot without exposing the whole app.</p>
              </div>
            )}
          </article>
        </section>
      ) : null}

      {activePage === "playbooks" ? (
        <section className="space-y-4 saas-page-section saas-page-playbooks">
          <div className="saas-insights-row">
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Saved playbooks</p>
              <h3>{playbooks.length}</h3>
              <p className="saas-stat-label">Store setup rules here instead of burying them under settings.</p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Top playbook</p>
              <h3>{playbookStats[0]?.label || "No data"}</h3>
              <p className="saas-stat-label">
                {playbookStats[0]
                  ? `${playbookStats[0].winRate}% win rate across ${playbookStats[0].trades} trades`
                  : "Attach trades to playbooks to compare execution quality."}
              </p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Top mistake tag</p>
              <h3>{mistakeStats[0]?.label || "Clean"}</h3>
              <p className="saas-stat-label">
                {mistakeStats[0]
                  ? `${mistakeStats[0].trades} trades tagged, -${mistakeStats[0].costRR}R cost`
                  : "Use mistake tags to expose expensive habits."}
              </p>
            </article>
          </div>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Playbook Library</h3>
                <p className="saas-card-subtitle">See your playbooks first. Raw JSON is tucked away unless you actually need it.</p>
              </div>
            </div>
            <div className="saas-main-grid mt-4">
              {playbooks.length ? (
                playbooks.map((playbook) => (
                  <article key={`playbook-card-${playbook.id}`} className="saas-note-card">
                    <h4>{playbook.name || "Untitled playbook"}</h4>
                    <p className="saas-playbook-meta mt-2">
                      <span>{playbook.setupType || "No setup"}</span>
                      {playbook.targetSession ? <span>{playbook.targetSession}</span> : null}
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
                    <p className="saas-stat-label mt-3">
                      ID: <strong>{playbook.id}</strong>
                    </p>
                  </article>
                ))
              ) : (
                <div className="saas-empty-state">
                  <strong>No playbooks yet</strong>
                  <p>Create one in the advanced editor or import your existing JSON to start comparing live execution against your playbook library.</p>
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
                    value={settingsDraft.playbooksJson}
                    onChange={(event) => setSettingsDraft((prev) => ({ ...prev, playbooksJson: event.target.value }))}
                    placeholder='[{"id":"london-breakout","name":"London Breakout","setupType":"Breakout"}]'
                    disabled={!isOnline || savingUserSettings}
                  />
                </label>
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
              <button type="button" className="landing-cta-secondary" onClick={() => setActivePage("settings")}>
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
              <h3>{activeProfileAccountSize > 0 ? formatCurrency(activeProfileAccountSize) : "-"}</h3>
              <p className="saas-stat-label">Active profile: {activeProfile?.name || "Workspace"}</p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Account return</p>
              <h3>{activeAccountPerformance ? `${activeAccountPerformance.returnPercent >= 0 ? "+" : ""}${activeAccountPerformance.returnPercent}%` : "-"}</h3>
              <p className="saas-stat-label">
                {activeAccountPerformance
                  ? `${formatCurrency(activeAccountPerformance.currentBalance)} current balance`
                  : "Set an account size to unlock account-aware performance."}
              </p>
            </article>
            <article className="panel saas-card saas-insight-card">
              <p className="saas-stat-kicker">Max drawdown</p>
              <h3>{activeAccountPerformance ? `${activeAccountPerformance.maxDrawdownPercent}%` : "-"}</h3>
              <p className="saas-stat-label">Account risk lives here instead of spreading across Review and Settings.</p>
            </article>
          </div>

          <article className="panel saas-card">
            <div className="saas-card-head">
              <div>
                <h3 className="saas-card-title">Equity + Goal Tracking</h3>
                <p className="saas-card-subtitle">Account goals, drawdown caps, and funded challenge progress.</p>
              </div>
            </div>
            {accountTimeline.points.length > 1 ? (
              <div className="saas-equity-curve-card mt-3">
                <svg viewBox="0 0 640 260" preserveAspectRatio="none" aria-hidden="true">
                  <polyline points={accountBalancePolyline} />
                </svg>
              </div>
            ) : (
              <p className="saas-stat-label mt-3">Add risk-aware trades to build an account equity curve.</p>
            )}
            <div className="saas-main-grid mt-4">
              <div className="saas-note-card">
                <h4>Daily Goal</h4>
                {dailyGoalProgress ? (
                  <>
                    <p className="saas-stat-label mt-2">
                      {dailyAccountPerformance?.returnPercent?.toFixed(2)}% of {dailyGoalProgress.targetPercent}% target
                    </p>
                    <div className="saas-progress saas-progress-green mt-3">
                      <span style={{ width: `${dailyGoalProgress.progressPercent}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="saas-stat-label mt-2">Set a daily profit target to track progress here.</p>
                )}
              </div>
              <div className="saas-note-card">
                <h4>Weekly Goal</h4>
                {weeklyGoalProgress ? (
                  <>
                    <p className="saas-stat-label mt-2">
                      {weeklyAccountPerformance?.returnPercent?.toFixed(2)}% of {weeklyGoalProgress.targetPercent}% target
                    </p>
                    <div className="saas-progress saas-progress-green mt-3">
                      <span style={{ width: `${weeklyGoalProgress.progressPercent}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="saas-stat-label mt-2">Set a weekly profit target to track progress here.</p>
                )}
              </div>
              <div className="saas-note-card">
                <h4>Daily Drawdown</h4>
                {dailyDrawdownProgress ? (
                  <>
                    <p className="saas-stat-label mt-2">
                      {dailyDrawdownProgress.usedPercent}% used of {dailyDrawdownProgress.capPercent}% cap
                    </p>
                    <div className="saas-progress saas-progress-red mt-3">
                      <span style={{ width: `${dailyDrawdownProgress.progressPercent}%` }} />
                    </div>
                  </>
                ) : (
                  <p className="saas-stat-label mt-2">Set a daily drawdown cap to track protection here.</p>
                )}
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
                <div className="saas-settings-actions mt-4">
                  <button type="button" className="btn-primary" onClick={() => setActivePage(tradeDetailReturnPage || "review")}>
                    Back
                  </button>
                  {selectedTrade?.screenshots?.before || selectedTrade?.screenshots?.after ? (
                    <button type="button" className="landing-cta-secondary" onClick={() => openInspectView(selectedTrade, selectedTrade?.screenshots?.before ? "before" : "after")}>
                      Inspect Screenshots
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
              <h3>{activeProfile?.name || "Workspace"}</h3>
              <p className="saas-stat-label">
                {activeAccountPerformance
                  ? `${formatAccountSize(activeProfile.accountSize)} start | ${activeAccountPerformance.returnPercent >= 0 ? "+" : ""}${activeAccountPerformance.returnPercent}% return`
                  : activeProfile?.accountSize > 0
                    ? `Account size ${formatAccountSize(activeProfile.accountSize)}`
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
                <span className="label">Create profile</span>
                <div className="flex w-full flex-col gap-2 sm:flex-row sm:items-center sm:justify-end">
                  <input
                    className="input w-full sm:w-[260px]"
                    value={newProfileName}
                    onChange={(event) => setNewProfileName(event.target.value)}
                    placeholder="Profile name"
                    maxLength={40}
                    disabled={!isOnline || creatingProfile}
                  />
                  <input
                    className="input w-full sm:w-[180px]"
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
                    className="btn-primary !px-4 !py-2 text-sm"
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
                  <button type="button" className="landing-cta-secondary" onClick={() => setActivePage("risk")}>
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

            <div className="saas-settings-grid mt-3">
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



