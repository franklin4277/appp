import Trade from "../models/Trade.js";

const startOfUtcDay = (date) => {
  const value = new Date(date);
  value.setUTCHours(0, 0, 0, 0);
  return value;
};

const endOfUtcDay = (date) => {
  const value = new Date(date);
  value.setUTCHours(23, 59, 59, 999);
  return value;
};

const isRuleAligned = (tags = {}) => Boolean(tags.asiaHighLowUsed && tags.pocInteraction);

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const createValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

export const evaluateGuardrails = async ({
  user,
  tradeDate,
  session,
  tags,
  ruleBreakReason,
}) => {
  const controls = user?.settings?.riskControls || {};
  const date = tradeDate ? new Date(tradeDate) : new Date();
  const rangeStart = startOfUtcDay(date);
  const rangeEnd = endOfUtcDay(date);

  const [
    sessionTradeCount,
    todayTrades,
    lastTrade,
  ] = await Promise.all([
    Trade.countDocuments({
      userId: user._id,
      session,
      tradeDate: { $gte: rangeStart, $lte: rangeEnd },
    }),
    Trade.find({
      userId: user._id,
      tradeDate: { $gte: rangeStart, $lte: rangeEnd },
    }).sort({ tradeDate: -1 }),
    Trade.findOne({
      userId: user._id,
      tradeDate: { $lt: date },
    }).sort({ tradeDate: -1 }),
  ]);

  const warnings = [];

  if (controls.requireRuleAlignment && !isRuleAligned(tags)) {
    if (!String(ruleBreakReason || "").trim()) {
      throw createValidationError(
        "Rule guardrail: add a rule-break reason when Asia High/Low and POC are not both true."
      );
    }
    warnings.push("Rule-break saved. Treat this as an exception, not your default process.");
  }

  if (toNumber(controls.maxTradesPerSession, 0) > 0 && sessionTradeCount >= controls.maxTradesPerSession) {
    warnings.push(
      `Overtrading warning: you already logged ${sessionTradeCount} ${session} trades for this date.`
    );
  }

  if (
    toNumber(controls.cooldownMinutesAfterLoss, 0) > 0 &&
    lastTrade &&
    lastTrade.result === "Loss"
  ) {
    const elapsed = (date.getTime() - new Date(lastTrade.tradeDate).getTime()) / 60000;
    if (elapsed < controls.cooldownMinutesAfterLoss) {
      warnings.push(
        `Cooldown warning: previous trade was a loss ${Math.max(0, Math.floor(elapsed))} minutes ago.`
      );
    }
  }

  if (toNumber(controls.stopForDayLossRR, 0) > 0) {
    const netDayRR = todayTrades.reduce((sum, trade) => sum + toNumber(trade.rrAchieved), 0);
    if (netDayRR <= -Math.abs(controls.stopForDayLossRR)) {
      warnings.push(
        `Stop-for-day warning: current day net RR is ${Math.round(netDayRR * 100) / 100}.`
      );
    }
  }

  return {
    warnings,
    sessionTradeCount,
    todaysTradeCount: todayTrades.length,
  };
};

