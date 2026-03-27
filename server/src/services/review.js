const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const round = (value, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const ensureText = (value = "") => String(value || "").trim();

const splitEmotionTokens = (value = "") =>
  String(value || "")
    .toLowerCase()
    .split(/[,\|/;\s]+/g)
    .map((item) => item.trim())
    .filter(Boolean);

export const weekRange = (referenceDate = new Date()) => {
  const end = new Date(referenceDate);
  end.setUTCHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);

  return { start, end };
};

export const summarizeWeeklyReview = (trades = []) => {
  const total = trades.length;
  const wins = trades.filter((trade) => trade.result === "Win").length;
  const totalRR = trades.reduce((sum, trade) => sum + toNumber(trade.rrAchieved), 0);
  const averageRR = total ? totalRR / total : 0;

  const setups = new Map();
  const emotions = new Map();

  const mistakeCounters = {
    nonClean: 0,
    noAsiaHL: 0,
    noPoc: 0,
    ruleBreak: 0,
  };

  trades.forEach((trade) => {
    const setupKey = ensureText(trade.setupType) || "Unlabeled setup";
    const setupBucket = setups.get(setupKey) || { total: 0, wins: 0, rr: 0 };
    setupBucket.total += 1;
    setupBucket.rr += toNumber(trade.rrAchieved);
    if (trade.result === "Win") {
      setupBucket.wins += 1;
    }
    setups.set(setupKey, setupBucket);

    splitEmotionTokens(trade.notes?.emotionalState).forEach((emotion) => {
      const emotionBucket = emotions.get(emotion) || { total: 0, rr: 0, wins: 0 };
      emotionBucket.total += 1;
      emotionBucket.rr += toNumber(trade.rrAchieved);
      if (trade.result === "Win") {
        emotionBucket.wins += 1;
      }
      emotions.set(emotion, emotionBucket);
    });

    if (!trade.tags?.cleanSetup) {
      mistakeCounters.nonClean += 1;
    }
    if (!trade.tags?.asiaHighLowUsed) {
      mistakeCounters.noAsiaHL += 1;
    }
    if (!trade.tags?.pocInteraction) {
      mistakeCounters.noPoc += 1;
    }
    if (ensureText(trade.ruleBreakReason)) {
      mistakeCounters.ruleBreak += 1;
    }
  });

  const bestSetup =
    [...setups.entries()]
      .map(([label, bucket]) => ({
        label,
        total: bucket.total,
        winRate: bucket.total ? round((bucket.wins / bucket.total) * 100, 1) : 0,
        averageRR: bucket.total ? round(bucket.rr / bucket.total, 2) : 0,
      }))
      .sort((a, b) => b.averageRR - a.averageRR)[0] || {
      label: "No setup data",
      total: 0,
      winRate: 0,
      averageRR: 0,
    };

  const biggestMistake =
    Object.entries(mistakeCounters)
      .map(([key, count]) => ({ key, count }))
      .sort((a, b) => b.count - a.count)[0] || { key: "none", count: 0 };

  const mistakeLabels = {
    nonClean: "Too many non-clean setups",
    noAsiaHL: "Trades without Asia High/Low reaction",
    noPoc: "Trades without POC interaction",
    ruleBreak: "Frequent rule breaks",
    none: "No major recurring mistake detected",
  };

  const topEmotion =
    [...emotions.entries()]
      .map(([label, bucket]) => ({
        label,
        total: bucket.total,
        winRate: bucket.total ? round((bucket.wins / bucket.total) * 100, 1) : 0,
        averageRR: bucket.total ? round(bucket.rr / bucket.total, 2) : 0,
      }))
      .filter((item) => item.total >= 2)
      .sort((a, b) => b.averageRR - a.averageRR)[0] || {
      label: "Not enough emotion tags",
      total: 0,
      winRate: 0,
      averageRR: 0,
    };

  const actionPlan = [];
  if (bestSetup.total >= 2) {
    actionPlan.push(`Prioritize ${bestSetup.label} where context matches your rules.`);
  }
  if (biggestMistake.count > 0) {
    actionPlan.push(`Reduce ${mistakeLabels[biggestMistake.key].toLowerCase()} this week.`);
  }
  if (topEmotion.total >= 2) {
    actionPlan.push(`Repeat the routine that creates the '${topEmotion.label}' state before entries.`);
  }
  if (averageRR < 0.25) {
    actionPlan.push("Only take setups with planned RR >= 1.2 and clean confirmation.");
  }
  if (!actionPlan.length) {
    actionPlan.push("Keep current execution process and review screenshots for micro improvements.");
  }

  return {
    totalTrades: total,
    winRate: total ? round((wins / total) * 100, 1) : 0,
    netRR: round(totalRR, 2),
    averageRR: round(averageRR, 2),
    bestSetup,
    biggestMistake: {
      label: mistakeLabels[biggestMistake.key] || mistakeLabels.none,
      count: biggestMistake.count || 0,
    },
    emotionPattern: topEmotion,
    actionPlan: actionPlan.slice(0, 4),
  };
};
