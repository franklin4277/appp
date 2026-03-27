const safePercent = (num, den) => {
  if (!den) {
    return 0;
  }
  return (num / den) * 100;
};

const round = (value, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toTimestamp = (dateValue) => {
  const ts = new Date(dateValue).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const sortByDateAsc = (trades = []) =>
  [...trades].sort((a, b) => toTimestamp(a.tradeDate) - toTimestamp(b.tradeDate));

const asLower = (value) => String(value || "").toLowerCase();

const isRuleAligned = (trade) => Boolean(trade.tags?.asiaHighLowUsed && trade.tags?.pocInteraction);

const summarizeTrades = (trades = []) => {
  const totalTrades = trades.length;
  const wins = trades.filter((trade) => trade.result === "Win").length;
  const losses = trades.filter((trade) => trade.result === "Loss").length;
  const breakEven = trades.filter((trade) => trade.result === "BE").length;
  const totalRR = trades.reduce((sum, trade) => sum + toNumber(trade.rrAchieved), 0);

  return {
    totalTrades,
    wins,
    losses,
    breakEven,
    winRate: round(safePercent(wins, totalTrades)),
    averageRR: round(totalTrades ? totalRR / totalTrades : 0),
  };
};

const buildProfitCurve = (trades = []) => {
  const sortedTrades = sortByDateAsc(trades);
  let cumulativeRR = 0;

  return sortedTrades.map((trade) => {
    cumulativeRR += toNumber(trade.rrAchieved);

    return {
      date: trade.tradeDate,
      cumulativeRR: round(cumulativeRR),
      rrAchieved: round(toNumber(trade.rrAchieved)),
      result: trade.result,
      setupType: trade.setupType,
      session: trade.session,
    };
  });
};

const buildDrawdownCurve = (profitCurve = []) => {
  let peak = Number.NEGATIVE_INFINITY;

  return profitCurve.map((point) => {
    peak = Math.max(peak, point.cumulativeRR);
    const drawdownRR = round(point.cumulativeRR - peak);
    return {
      date: point.date,
      cumulativeRR: point.cumulativeRR,
      peakRR: round(peak),
      drawdownRR,
    };
  });
};

const buildSetupBreakdown = (trades = []) => {
  const continuationTrades = trades.filter((trade) => asLower(trade.setupType).includes("continuation"));
  const reversalTrades = trades.filter((trade) => asLower(trade.setupType).includes("reversal"));

  return {
    continuation: summarizeTrades(continuationTrades),
    reversal: summarizeTrades(reversalTrades),
  };
};

const computeConfidence = (sampleSize, totalSize) => {
  if (!sampleSize) {
    return 0;
  }
  const baseline = Math.max(totalSize, 20);
  return Math.min(100, round((sampleSize / baseline) * 140, 1));
};

const rankCondition = ({ key, label, trades, totalSize }) => {
  const summary = summarizeTrades(trades);
  const confidence = computeConfidence(summary.totalTrades, totalSize);
  const score = round(summary.averageRR * 45 + summary.winRate * 0.4 + confidence * 0.15, 2);
  return {
    key,
    label,
    confidence,
    score,
    ...summary,
  };
};

const uniqueValues = (trades, field) =>
  [...new Set(trades.map((trade) => String(trade[field] || "").trim()).filter(Boolean))];

const buildTagAnalytics = (trades = []) => {
  const buckets = [
    {
      key: "asiaHighLowUsed:yes",
      label: "Asia High/Low used: Yes",
      filter: (trade) => trade.tags?.asiaHighLowUsed === true,
    },
    {
      key: "asiaHighLowUsed:no",
      label: "Asia High/Low used: No",
      filter: (trade) => trade.tags?.asiaHighLowUsed === false,
    },
    {
      key: "pocInteraction:yes",
      label: "POC interaction: Yes",
      filter: (trade) => trade.tags?.pocInteraction === true,
    },
    {
      key: "pocInteraction:no",
      label: "POC interaction: No",
      filter: (trade) => trade.tags?.pocInteraction === false,
    },
    {
      key: "pocOutcome:Acceptance",
      label: "POC outcome: Acceptance",
      filter: (trade) => asLower(trade.tags?.pocOutcome) === "acceptance",
    },
    {
      key: "pocOutcome:Rejection",
      label: "POC outcome: Rejection",
      filter: (trade) => asLower(trade.tags?.pocOutcome) === "rejection",
    },
    {
      key: "cleanSetup:yes",
      label: "Clean setup: Yes (A+)",
      filter: (trade) => trade.tags?.cleanSetup === true,
    },
    {
      key: "cleanSetup:no",
      label: "Clean setup: No",
      filter: (trade) => trade.tags?.cleanSetup === false,
    },
  ];

  const ranked = buckets
    .map((bucket) =>
      rankCondition({
        key: bucket.key,
        label: bucket.label,
        trades: trades.filter(bucket.filter),
        totalSize: trades.length,
      })
    )
    .filter((item) => item.totalTrades > 0)
    .sort((a, b) => b.score - a.score);

  return {
    items: ranked,
    bestConditions: ranked.filter((item) => item.totalTrades >= 3).slice(0, 4),
    worstConditions: [...ranked].reverse().filter((item) => item.totalTrades >= 3).slice(0, 3),
    confidenceRanked: ranked.filter((item) => item.totalTrades >= 2).slice(0, 8),
  };
};

const buildHeatmap = (trades = []) => {
  const sessions = uniqueValues(trades, "session");
  const setupTypes = uniqueValues(trades, "setupType");
  const cells = [];

  sessions.forEach((session) => {
    setupTypes.forEach((setupType) => {
      const scoped = trades.filter((trade) => trade.session === session && trade.setupType === setupType);
      const summary = summarizeTrades(scoped);
      cells.push({
        session,
        setupType,
        totalTrades: summary.totalTrades,
        winRate: summary.winRate,
        averageRR: summary.averageRR,
      });
    });
  });

  return {
    sessions,
    setupTypes,
    cells,
  };
};

const buildStreaks = (trades = []) => {
  const sorted = sortByDateAsc(trades);
  let bestWinStreak = 0;
  let bestLossStreak = 0;
  let currentWin = 0;
  let currentLoss = 0;
  let currentRuleAligned = 0;
  let bestRuleAligned = 0;

  sorted.forEach((trade) => {
    if (trade.result === "Win") {
      currentWin += 1;
      currentLoss = 0;
    } else if (trade.result === "Loss") {
      currentLoss += 1;
      currentWin = 0;
    } else {
      currentWin = 0;
      currentLoss = 0;
    }

    bestWinStreak = Math.max(bestWinStreak, currentWin);
    bestLossStreak = Math.max(bestLossStreak, currentLoss);

    if (isRuleAligned(trade)) {
      currentRuleAligned += 1;
    } else {
      currentRuleAligned = 0;
    }
    bestRuleAligned = Math.max(bestRuleAligned, currentRuleAligned);
  });

  const latest = sorted[sorted.length - 1];
  const currentWinStreak = latest?.result === "Win" ? currentWin : 0;
  const currentLossStreak = latest?.result === "Loss" ? currentLoss : 0;

  return {
    currentWinStreak,
    currentLossStreak,
    bestWinStreak,
    worstLossStreak: bestLossStreak,
    bestRuleAlignmentStreak: bestRuleAligned,
    currentRuleAlignmentStreak: currentRuleAligned,
  };
};

const buildConditionScores = (trades = []) => {
  const sessions = uniqueValues(trades, "session");
  const setups = uniqueValues(trades, "setupType");
  const conditions = [];

  sessions.forEach((session) => {
    conditions.push(
      rankCondition({
        key: `session:${session}`,
        label: `Session: ${session}`,
        trades: trades.filter((trade) => trade.session === session),
        totalSize: trades.length,
      })
    );
  });

  setups.forEach((setup) => {
    conditions.push(
      rankCondition({
        key: `setup:${setup}`,
        label: `Setup: ${setup}`,
        trades: trades.filter((trade) => trade.setupType === setup),
        totalSize: trades.length,
      })
    );
  });

  ["Acceptance", "Rejection"].forEach((outcome) => {
    conditions.push(
      rankCondition({
        key: `poc:${outcome}`,
        label: `POC ${outcome}`,
        trades: trades.filter((trade) => asLower(trade.tags?.pocOutcome) === asLower(outcome)),
        totalSize: trades.length,
      })
    );
  });

  conditions.push(
    rankCondition({
      key: "cleanSetup",
      label: "Clean Setup (A+)",
      trades: trades.filter((trade) => trade.tags?.cleanSetup),
      totalSize: trades.length,
    })
  );

  return conditions
    .filter((item) => item.totalTrades > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, 12);
};

const summarizeQuality = (trades = []) => {
  const total = trades.length || 1;
  const cleanRate = safePercent(trades.filter((trade) => trade.tags?.cleanSetup).length, total);
  const ruleRate = safePercent(trades.filter((trade) => isRuleAligned(trade)).length, total);
  return {
    cleanRate: round(cleanRate),
    ruleRate: round(ruleRate),
  };
};

const filterByDateRange = (trades, start, end) =>
  trades.filter((trade) => {
    const ts = toTimestamp(trade.tradeDate);
    return ts >= start.getTime() && ts <= end.getTime();
  });

const buildCoachingBlock = (label, trades = []) => {
  const summary = summarizeTrades(trades);
  const quality = summarizeQuality(trades);
  const strengths = [];
  const mistakes = [];

  if (summary.winRate >= 55) {
    strengths.push(`Win rate is strong at ${summary.winRate}%.`);
  }
  if (summary.averageRR >= 0.5) {
    strengths.push(`Average RR is healthy at ${summary.averageRR}.`);
  }
  if (quality.ruleRate >= 75) {
    strengths.push(`Rule alignment is disciplined at ${quality.ruleRate}%.`);
  }
  if (quality.cleanRate >= 60) {
    strengths.push(`Clean setup selection is solid at ${quality.cleanRate}%.`);
  }

  if (summary.winRate < 45) {
    mistakes.push(`Win rate slipped to ${summary.winRate}%.`);
  }
  if (summary.averageRR < 0.25) {
    mistakes.push(`Average RR is low at ${summary.averageRR}.`);
  }
  if (quality.ruleRate < 70) {
    mistakes.push(`Rule alignment is below target at ${quality.ruleRate}%.`);
  }
  if (quality.cleanRate < 50) {
    mistakes.push(`Too many non-clean setups (${quality.cleanRate}% clean).`);
  }

  const focus = mistakes[0]
    ? `Primary focus: ${mistakes[0].replace(/\.$/, "")}.`
    : "Primary focus: keep execution consistency and avoid unnecessary setup changes.";

  return {
    label,
    totalTrades: summary.totalTrades,
    netRR: round(trades.reduce((sum, trade) => sum + toNumber(trade.rrAchieved), 0)),
    winRate: summary.winRate,
    averageRR: summary.averageRR,
    strengths: strengths.slice(0, 3),
    mistakes: mistakes.slice(0, 3),
    focus,
  };
};

const buildCoachingSummary = (trades = []) => {
  if (!trades.length) {
    return {
      daily: buildCoachingBlock("Daily", []),
      weekly: buildCoachingBlock("Weekly", []),
    };
  }

  const latestDate = new Date(Math.max(...trades.map((trade) => toTimestamp(trade.tradeDate))));
  const dayStart = new Date(latestDate);
  dayStart.setUTCHours(0, 0, 0, 0);
  const dayEnd = new Date(latestDate);
  dayEnd.setUTCHours(23, 59, 59, 999);

  const weekStart = new Date(dayStart);
  weekStart.setUTCDate(weekStart.getUTCDate() - 6);

  const dailyTrades = filterByDateRange(trades, dayStart, dayEnd);
  const weeklyTrades = filterByDateRange(trades, weekStart, dayEnd);

  return {
    daily: {
      date: dayStart.toISOString().slice(0, 10),
      ...buildCoachingBlock("Daily", dailyTrades),
    },
    weekly: {
      periodStart: weekStart.toISOString().slice(0, 10),
      periodEnd: dayEnd.toISOString().slice(0, 10),
      ...buildCoachingBlock("Weekly", weeklyTrades),
    },
  };
};

export const buildLocalDashboardAnalytics = (trades = []) => {
  const overview = summarizeTrades(trades);
  const setupBreakdown = buildSetupBreakdown(trades);
  const profitCurve = buildProfitCurve(trades);
  const drawdownCurve = buildDrawdownCurve(profitCurve);
  const tagAnalytics = buildTagAnalytics(trades);
  const cleanOnlyTrades = trades.filter((trade) => trade.tags?.cleanSetup);
  const cleanOnlyPerformance = summarizeTrades(cleanOnlyTrades);
  const heatmap = buildHeatmap(trades);
  const streaks = buildStreaks(trades);
  const conditionScores = buildConditionScores(trades);
  const coaching = buildCoachingSummary(trades);

  return {
    overview,
    setupBreakdown,
    profitCurve,
    drawdownCurve,
    tagAnalytics,
    cleanOnlyPerformance,
    heatmap,
    streaks,
    conditionScores,
    coaching,
  };
};
