const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round((value + Number.EPSILON) * factor) / factor;
};

const toTimestamp = (value) => {
  const ts = new Date(value).getTime();
  return Number.isFinite(ts) ? ts : 0;
};

const summarizeTrades = (trades = []) => {
  const total = trades.length;
  if (!total) {
    return {
      totalTrades: 0,
      wins: 0,
      losses: 0,
      winRate: 0,
      averageRR: 0,
      netRR: 0,
    };
  }

  const wins = trades.filter((trade) => trade.result === "Win");
  const losses = trades.filter((trade) => trade.result === "Loss");
  const netRR = trades.reduce((sum, trade) => sum + toNumber(trade.rrAchieved), 0);

  return {
    totalTrades: total,
    wins: wins.length,
    losses: losses.length,
    winRate: round((wins.length / total) * 100, 1),
    averageRR: round(netRR / total),
    netRR: round(netRR),
  };
};

const normalizeEmotionTags = (text = "") =>
  String(text || "")
    .toLowerCase()
    .split(/[,\|/; ]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const groupBy = (items = [], keySelector = () => "") => {
  const map = new Map();
  items.forEach((item) => {
    const key = String(keySelector(item) || "").trim();
    if (!key) {
      return;
    }
    const current = map.get(key) || [];
    current.push(item);
    map.set(key, current);
  });
  return map;
};

const findBestBucket = (trades = [], selector, minTrades = 3) => {
  const grouped = groupBy(trades, selector);
  const ranked = [...grouped.entries()]
    .map(([key, scopedTrades]) => {
      const summary = summarizeTrades(scopedTrades);
      return {
        key,
        ...summary,
      };
    })
    .filter((row) => row.totalTrades >= minTrades)
    .sort((a, b) => {
      const scoreA = a.averageRR * 100 + a.winRate;
      const scoreB = b.averageRR * 100 + b.winRate;
      return scoreB - scoreA;
    });

  return ranked[0] || null;
};

const detectWorstEmotion = (trades = []) => {
  const buckets = new Map();
  trades.forEach((trade) => {
    normalizeEmotionTags(trade?.notes?.emotionalState).forEach((emotion) => {
      const current = buckets.get(emotion) || [];
      current.push(trade);
      buckets.set(emotion, current);
    });
  });

  const ranked = [...buckets.entries()]
    .map(([emotion, scopedTrades]) => ({
      emotion,
      ...summarizeTrades(scopedTrades),
    }))
    .filter((row) => row.totalTrades >= 3)
    .sort((a, b) => a.averageRR - b.averageRR);

  return ranked[0] || null;
};

const detectWorstHabit = (trades = []) => {
  const inPlan = trades.filter(
    (trade) => trade.tags?.asiaHighLowUsed && trade.tags?.pocInteraction && trade.tags?.cleanSetup
  );
  const outOfPlan = trades.filter(
    (trade) => !(trade.tags?.asiaHighLowUsed && trade.tags?.pocInteraction && trade.tags?.cleanSetup)
  );

  if (inPlan.length >= 4 && outOfPlan.length >= 4) {
    const inPlanSummary = summarizeTrades(inPlan);
    const outSummary = summarizeTrades(outOfPlan);
    const gap = round(outSummary.averageRR - inPlanSummary.averageRR);
    if (gap <= -0.2) {
      return {
        title: "Trading outside plan reduces performance",
        detail: `Out-of-plan trades are ${Math.abs(gap)} RR lower on average.`,
      };
    }
  }

  const worstEmotion = detectWorstEmotion(trades);
  if (worstEmotion) {
    return {
      title: `Emotion risk: ${worstEmotion.emotion}`,
      detail: `${worstEmotion.totalTrades} trades average ${worstEmotion.averageRR} RR.`,
    };
  }

  const nonClean = trades.filter((trade) => !trade.tags?.cleanSetup);
  if (nonClean.length >= 5) {
    const nonCleanSummary = summarizeTrades(nonClean);
    return {
      title: "Too many non-clean setups",
      detail: `${nonCleanSummary.totalTrades} non-clean trades at ${nonCleanSummary.winRate}% win rate.`,
    };
  }

  return {
    title: "No major habit leak detected",
    detail: "Keep journaling consistently to uncover deeper behavior patterns.",
  };
};

const computeExpectancy = (trades = []) => {
  if (!trades.length) {
    return 0;
  }

  const winTrades = trades.filter((trade) => trade.result === "Win");
  const lossTrades = trades.filter((trade) => trade.result === "Loss");
  const winRate = winTrades.length / trades.length;
  const lossRate = lossTrades.length / trades.length;
  const avgWin = winTrades.length
    ? winTrades.reduce((sum, trade) => sum + Math.max(0, toNumber(trade.rrAchieved)), 0) / winTrades.length
    : 0;
  const avgLossAbs = lossTrades.length
    ? Math.abs(
        lossTrades.reduce((sum, trade) => sum + Math.min(0, toNumber(trade.rrAchieved)), 0) / lossTrades.length
      )
    : 0;

  return round(winRate * avgWin - lossRate * avgLossAbs, 2);
};

const computeMaxDrawdown = (drawdownCurve = []) => {
  if (!drawdownCurve.length) {
    return 0;
  }
  const minDrawdown = drawdownCurve.reduce(
    (min, point) => Math.min(min, toNumber(point.drawdownRR)),
    0
  );
  return round(minDrawdown, 2);
};

const startOfDay = (date) => {
  const clone = new Date(date);
  clone.setHours(0, 0, 0, 0);
  return clone;
};

const startOfMonth = (date) => new Date(date.getFullYear(), date.getMonth(), 1);

const monthLabel = (date) =>
  date.toLocaleDateString([], {
    month: "short",
    year: "numeric",
  });

export const buildMonthlyBreakdown = (trades = [], monthCount = 6) => {
  const now = new Date();
  const oldestMonth = new Date(now.getFullYear(), now.getMonth() - (monthCount - 1), 1).getTime();
  const scoped = [...trades]
    .filter((trade) => {
      const ts = toTimestamp(trade.tradeDate);
      return ts >= oldestMonth;
    })
    .sort((a, b) => toTimestamp(a.tradeDate) - toTimestamp(b.tradeDate));

  const buckets = new Map();
  scoped.forEach((trade) => {
    const ts = toTimestamp(trade.tradeDate);
    const date = new Date(ts);
    const key = `${date.getFullYear()}-${date.getMonth()}`;
    const current = buckets.get(key) || {
      key,
      monthDate: startOfMonth(date),
      month: monthLabel(date),
      trades: [],
    };
    current.trades.push(trade);
    buckets.set(key, current);
  });

  return [...buckets.values()]
    .map((bucket) => {
      const summary = summarizeTrades(bucket.trades);
      const bestSetup = findBestBucket(bucket.trades, (trade) => trade.setupType, 2);
      return {
        key: bucket.key,
        month: bucket.month,
        totalTrades: summary.totalTrades,
        winRate: summary.winRate,
        averageRR: summary.averageRR,
        netRR: summary.netRR,
        bestSetup: bestSetup?.key || "N/A",
      };
    })
    .sort((a, b) => a.key.localeCompare(b.key));
};

export const buildEdgeInsights = ({ trades = [], analytics = {}, riskControls = {} }) => {
  const closedTrades = trades.filter((trade) => String(trade?.automation?.status || "").toLowerCase() !== "open");
  const overview = summarizeTrades(closedTrades);
  const expectancy = computeExpectancy(closedTrades);
  const bestSetup = findBestBucket(closedTrades, (trade) => trade.setupType, 3);
  const bestSession = findBestBucket(closedTrades, (trade) => trade.session, 3);
  const bestCondition = analytics?.conditionScores?.[0] || null;
  const worstHabit = detectWorstHabit(closedTrades);
  const equityNow = toNumber(analytics?.profitCurve?.[analytics?.profitCurve?.length - 1]?.cumulativeRR, 0);
  const maxDrawdown = computeMaxDrawdown(analytics?.drawdownCurve || []);

  const weekStart = startOfDay(new Date(Date.now() - 6 * 24 * 60 * 60 * 1000)).getTime();
  const weeklyTrades = closedTrades.filter((trade) => toTimestamp(trade.tradeDate) >= weekStart);
  const maxTradesPerSession = Math.max(Number(riskControls?.maxTradesPerSession || 4), 1);
  const weeklyThreshold = maxTradesPerSession * 3;

  const notifications = [];
  if (weeklyTrades.length > weeklyThreshold) {
    notifications.push({
      id: "overtrading",
      level: "warn",
      message: `You are overtrading this week (${weeklyTrades.length} trades).`,
    });
  }
  if (expectancy < 0) {
    notifications.push({
      id: "negative-expectancy",
      level: "warn",
      message: `Expectancy is negative (${expectancy} RR/trade). Tighten setup quality.`,
    });
  }
  if (bestSession) {
    notifications.push({
      id: "best-session",
      level: "info",
      message: `${bestSession.key} session is currently strongest (${bestSession.winRate}% win rate).`,
    });
  }

  return {
    overview,
    expectancy,
    equityNow: round(equityNow),
    maxDrawdown,
    bestSetup,
    bestSession,
    bestCondition,
    worstHabit,
    notifications,
  };
};

