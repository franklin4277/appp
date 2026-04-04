export const DEFAULT_STRATEGY_OPTIONS = {
  pairs: ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD", "EURJPY"],
  sessions: ["Asia", "London", "New York"],
  setupTypes: ["Asia Break -> Continuation", "Asia Break -> Reversal"],
  tradeTypes: ["Buy", "Sell"],
  results: ["Win", "Loss", "BE"],
  pocOutcomes: ["Acceptance", "Rejection"],
  emotionTags: ["calm", "focused", "rushed", "FOMO"],
};

export const DEFAULT_PLAYBOOKS = [
  {
    id: "london-breakout",
    name: "London Breakout",
    setupType: "Asia Break -> Continuation",
    targetSession: "London",
    confirmations: ["Liquidity sweep", "Impulse close", "Structure reclaim"],
    invalidations: ["No displacement", "Entry into nearby opposing liquidity"],
    checklist: ["Bias aligned", "Defined stop", "Target mapped"],
    notes: "Use when London confirms the Asia range break with clean momentum.",
  },
  {
    id: "ny-reversal",
    name: "New York Reversal",
    setupType: "Asia Break -> Reversal",
    targetSession: "New York",
    confirmations: ["HTF level", "Rejection wick", "Volume expansion"],
    invalidations: ["Trend still expanding", "No rejection"],
    checklist: ["Level respected", "Risk capped", "Exit plan written"],
    notes: "Best when New York runs liquidity and quickly rejects a key level.",
  },
];

export const DEFAULT_REVIEW_TOOLKIT = {
  mistakeTags: [
    "Late entry",
    "Oversized risk",
    "Early close",
    "Revenge trade",
    "Overtrading",
    "Ignored checklist",
  ],
  fundedMode: {
    enabled: false,
    provider: "",
    profitTargetPercent: 8,
    maxTotalDrawdownPercent: 10,
    consistencyPercent: 25,
    minTradingDays: 5,
  },
};

export const DEFAULT_RISK_CONTROLS = {
  requireRuleAlignment: true,
  maxTradesPerSession: 4,
  cooldownMinutesAfterLoss: 30,
  stopForDayLossRR: 3,
  maxRiskPerTradePercent: 1,
  dailyProfitTargetPercent: 1.5,
  weeklyProfitTargetPercent: 4,
  maxDailyDrawdownPercent: 2,
  strictChecklistGate: false,
};
