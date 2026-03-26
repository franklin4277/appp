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

export const summarizeTrades = (trades) => {
  const totalTrades = trades.length;
  const wins = trades.filter((trade) => trade.result === "Win").length;
  const losses = trades.filter((trade) => trade.result === "Loss").length;
  const breakEven = trades.filter((trade) => trade.result === "BE").length;
  const totalRR = trades.reduce((sum, trade) => sum + (trade.rrAchieved || 0), 0);

  return {
    totalTrades,
    wins,
    losses,
    breakEven,
    winRate: round(safePercent(wins, totalTrades)),
    averageRR: round(totalTrades ? totalRR / totalTrades : 0),
  };
};

const buildProfitCurve = (trades) => {
  const sortedTrades = [...trades].sort(
    (a, b) => new Date(a.tradeDate).getTime() - new Date(b.tradeDate).getTime()
  );

  let cumulativeRR = 0;

  return sortedTrades.map((trade) => {
    cumulativeRR += trade.rrAchieved || 0;

    return {
      date: trade.tradeDate,
      cumulativeRR: round(cumulativeRR),
      rrAchieved: round(trade.rrAchieved || 0),
      result: trade.result,
      setupType: trade.setupType,
    };
  });
};

const buildSetupBreakdown = (trades) => {
  const setupGroups = {
    "Asia Break -> Continuation": [],
    "Asia Break -> Reversal": [],
  };

  trades.forEach((trade) => {
    if (setupGroups[trade.setupType]) {
      setupGroups[trade.setupType].push(trade);
    }
  });

  return {
    continuation: summarizeTrades(setupGroups["Asia Break -> Continuation"]),
    reversal: summarizeTrades(setupGroups["Asia Break -> Reversal"]),
  };
};

const buildTagAnalytics = (trades) => {
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
      filter: (trade) => trade.tags?.pocOutcome === "Acceptance",
    },
    {
      key: "pocOutcome:Rejection",
      label: "POC outcome: Rejection",
      filter: (trade) => trade.tags?.pocOutcome === "Rejection",
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

  const items = buckets
    .map((bucket) => {
      const bucketTrades = trades.filter(bucket.filter);
      const summary = summarizeTrades(bucketTrades);

      return {
        key: bucket.key,
        label: bucket.label,
        ...summary,
      };
    })
    .filter((item) => item.totalTrades > 0)
    .sort((a, b) => b.averageRR - a.averageRR);

  const bestConditions = items.filter((item) => item.totalTrades >= 3).slice(0, 4);

  return { items, bestConditions };
};

export const buildDashboardAnalytics = (trades) => {
  const overview = summarizeTrades(trades);
  const setupBreakdown = buildSetupBreakdown(trades);
  const profitCurve = buildProfitCurve(trades);
  const tagAnalytics = buildTagAnalytics(trades);
  const cleanOnlyTrades = trades.filter((trade) => trade.tags?.cleanSetup);
  const cleanOnlyPerformance = summarizeTrades(cleanOnlyTrades);

  return {
    overview,
    setupBreakdown,
    profitCurve,
    tagAnalytics,
    cleanOnlyPerformance,
  };
};
