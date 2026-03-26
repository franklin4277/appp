export const DEFAULT_STRATEGY_OPTIONS = {
  pairs: ["EURUSD", "GBPUSD", "USDJPY", "AUDUSD", "USDCAD", "USDCHF", "NZDUSD", "EURJPY"],
  sessions: ["Asia", "London", "New York"],
  setupTypes: ["Asia Break -> Continuation", "Asia Break -> Reversal"],
  tradeTypes: ["Buy", "Sell"],
  results: ["Win", "Loss", "BE"],
  pocOutcomes: ["Acceptance", "Rejection"],
  emotionTags: ["calm", "focused", "rushed", "FOMO"],
};

export const DEFAULT_RISK_CONTROLS = {
  requireRuleAlignment: true,
  maxTradesPerSession: 4,
  cooldownMinutesAfterLoss: 30,
  stopForDayLossRR: 3,
};

