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
const RAPID_TRADE_WINDOW_MINUTES = 8;

const createValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

export const evaluateGuardrails = async ({
  user,
  profileId,
  tradeDate,
  session,
  tags,
  ruleBreakReason,
  riskPercent,
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
      profileId,
      session,
      tradeDate: { $gte: rangeStart, $lte: rangeEnd },
    }),
    Trade.find({
      userId: user._id,
      profileId,
      tradeDate: { $gte: rangeStart, $lte: rangeEnd },
    }).sort({ tradeDate: -1 }),
    Trade.findOne({
      userId: user._id,
      profileId,
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

  const maxTradesPerSession = toNumber(controls.maxTradesPerSession, 0);
  if (maxTradesPerSession > 0) {
    if (sessionTradeCount >= maxTradesPerSession) {
      warnings.push(
        `Overtrading warning: you already logged ${sessionTradeCount} ${session} trades for this date.`
      );
    } else if (sessionTradeCount === maxTradesPerSession - 1) {
      warnings.push(
        `Near overtrading limit: next ${session} trade reaches ${maxTradesPerSession} trades for this date.`
      );
    }
  }

  const lastSameSessionTrade = todayTrades.find((trade) => trade.session === session);
  if (lastSameSessionTrade?.tradeDate) {
    const elapsedSinceSessionTrade = Math.floor(
      (date.getTime() - new Date(lastSameSessionTrade.tradeDate).getTime()) / 60000
    );
    if (elapsedSinceSessionTrade >= 0 && elapsedSinceSessionTrade < RAPID_TRADE_WINDOW_MINUTES) {
      warnings.push(
        `Rapid-fire warning: previous ${session} trade was ${elapsedSinceSessionTrade} minutes ago.`
      );
    }
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

  const maxRiskPerTradePercent = toNumber(controls.maxRiskPerTradePercent, 0);
  const submittedRiskPercent = toNumber(riskPercent, 0);
  if (maxRiskPerTradePercent > 0 && submittedRiskPercent > maxRiskPerTradePercent) {
    warnings.push(
      `Risk warning: this trade risks ${Math.round(submittedRiskPercent * 100) / 100}% which exceeds your ${Math.round(
        maxRiskPerTradePercent * 100
      ) / 100}% cap.`
    );
  }

  const maxDailyDrawdownPercent = toNumber(controls.maxDailyDrawdownPercent, 0);
  const accountSize = Number(
    (user?.profiles || []).find((profile) => profile.id === profileId)?.accountSize || 0
  );
  if (maxDailyDrawdownPercent > 0 && Number.isFinite(accountSize) && accountSize > 0) {
    const dayPnlPercent = todayTrades.reduce((sum, trade) => {
      const tradeRiskPercent = Math.max(toNumber(trade?.riskPercent, 0), 0);
      const rrAchieved = toNumber(trade?.rrAchieved, 0);
      return sum + tradeRiskPercent * rrAchieved;
    }, 0);
    if (dayPnlPercent <= -Math.abs(maxDailyDrawdownPercent)) {
      warnings.push(
        `Drawdown warning: this profile is down ${Math.abs(Math.round(dayPnlPercent * 100) / 100)}% today.`
      );
    }
  }

  return {
    warnings,
    sessionTradeCount,
    todaysTradeCount: todayTrades.length,
  };
};
