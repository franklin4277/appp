const slugValue = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 48);

const toFinite = (value, fallback = Number.NaN) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

export const buildStrategyFingerprint = (payload = {}) => {
  const session = slugValue(payload.session || "unknown-session");
  const setupType = slugValue(payload.setupType || "unknown-setup");
  const tradeType = slugValue(payload.tradeType || "unknown-side");
  const pocOutcome = slugValue(payload.tags?.pocOutcome || "none");
  const asia = payload.tags?.asiaHighLowUsed ? "1" : "0";
  const poc = payload.tags?.pocInteraction ? "1" : "0";
  const clean = payload.tags?.cleanSetup ? "1" : "0";

  return [
    `session:${session}`,
    `setup:${setupType}`,
    `side:${tradeType}`,
    `asiahl:${asia}`,
    `poc:${poc}`,
    `outcome:${pocOutcome}`,
    `clean:${clean}`,
  ].join("|");
};

export const computeQualityFlags = ({
  entryPrice,
  stopLoss,
  takeProfit,
  plannedRR,
  rrAchieved,
  result,
  eventType = "",
  exitTime = null,
  tradeDate = null,
  recordingDurationSeconds = 0,
} = {}) => {
  const flags = [];
  const entry = toFinite(entryPrice);
  const sl = toFinite(stopLoss);
  const tp = toFinite(takeProfit);
  const planned = toFinite(plannedRR, 0);
  const achieved = toFinite(rrAchieved, 0);
  const duration = toFinite(recordingDurationSeconds, 0);

  if (!Number.isFinite(entry) || entry <= 0) {
    flags.push("invalid_entry_price");
  }
  if (!Number.isFinite(sl) || sl <= 0) {
    flags.push("missing_or_invalid_stop_loss");
  }
  if (!Number.isFinite(tp) || tp <= 0) {
    flags.push("missing_or_invalid_take_profit");
  }
  if (Number.isFinite(entry) && Number.isFinite(sl) && Math.abs(entry - sl) === 0) {
    flags.push("zero_risk_distance");
  }
  if (Number.isFinite(planned) && planned > 0 && planned < 0.5) {
    flags.push("planned_rr_too_low");
  }
  if (Number.isFinite(duration) && duration > 20) {
    flags.push("recording_duration_over_policy");
  }

  const normalizedResult = String(result || "").trim();
  if (normalizedResult === "Win" && achieved <= 0) {
    flags.push("result_rr_mismatch_win");
  }
  if (normalizedResult === "Loss" && achieved > 0) {
    flags.push("result_rr_mismatch_loss");
  }
  if (eventType === "entry" && normalizedResult !== "BE") {
    flags.push("entry_event_non_be_result");
  }

  if (exitTime && tradeDate) {
    const exitTs = new Date(exitTime).getTime();
    const entryTs = new Date(tradeDate).getTime();
    if (Number.isFinite(exitTs) && Number.isFinite(entryTs) && exitTs < entryTs) {
      flags.push("exit_before_entry");
    }
  }

  return [...new Set(flags)];
};

