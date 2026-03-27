import Trade from "../models/Trade.js";
import { buildDashboardAnalytics } from "../services/analytics.js";
import { parseTradesCsv, buildTradesCsv } from "../services/csv.js";
import { evaluateGuardrails } from "../services/guardrails.js";
import { resolveActiveProfileId, resolveDefaultProfileId } from "../services/auth.js";
import { recordAudit } from "../services/audit.js";
import { formatStoredFileUrl, storeScreenshot } from "../services/storage.js";

const toBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    const normalized = value.trim().toLowerCase();
    return ["true", "1", "yes", "y"].includes(normalized);
  }

  if (typeof value === "number") {
    return value === 1;
  }

  return false;
};

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
};

const round = (value, precision = 2) => {
  const factor = 10 ** precision;
  return Math.round((Number(value) + Number.EPSILON) * factor) / factor;
};

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const applyTextFilter = (filter, field, value) => {
  const normalized = String(value || "").trim();
  if (!normalized) {
    return;
  }

  filter[field] = {
    $regex: escapeRegex(normalized),
    $options: "i",
  };
};

const calculatePlannedRR = (entry, stopLoss, takeProfit) => {
  const risk = Math.abs(entry - stopLoss);
  const reward = Math.abs(takeProfit - entry);

  if (!risk) {
    return 0;
  }

  return reward / risk;
};

const calculateAchievedRR = (result, plannedRR) => {
  if (String(result).trim() === "Win") {
    return plannedRR;
  }

  if (String(result).trim() === "Loss") {
    return -1;
  }

  return 0;
};

const parseDate = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date();
  }
  return date;
};

const ensurePair = (value = "") => String(value || "").trim().toUpperCase();
const ensureText = (value = "") => String(value || "").trim();

const splitEmotionTokens = (value = "") =>
  String(value || "")
    .toLowerCase()
    .split(/[,\|/;\s]+/g)
    .map((item) => item.trim())
    .filter(Boolean);

const resolveProfileId = (req, source = {}) => {
  const requested = ensureText(source.profileId || req.query.profileId || req.body.profileId);
  if (!requested) {
    return resolveActiveProfileId(req.user);
  }

  const exists = (req.user.profiles || []).some((profile) => profile.id === requested);
  if (exists) {
    return requested;
  }

  return resolveActiveProfileId(req.user);
};

const transformTrade = (trade, req) => ({
  ...trade.toObject(),
  screenshots: {
    before: formatStoredFileUrl(req, trade.screenshots?.before),
    after: formatStoredFileUrl(req, trade.screenshots?.after),
  },
});

const buildFilterFromRequest = (req) => {
  const { pair, session, setupType, cleanOnly = "false" } = req.query;
  const profileId = resolveProfileId(req);
  const defaultProfileId = resolveDefaultProfileId(req.user);
  const filter = {
    userId: req.user._id,
  };

  if (profileId === defaultProfileId) {
    filter.$or = [{ profileId }, { profileId: { $exists: false } }, { profileId: null }];
  } else {
    filter.profileId = profileId;
  }

  applyTextFilter(filter, "pair", pair);
  applyTextFilter(filter, "session", session);
  applyTextFilter(filter, "setupType", setupType);
  if (cleanOnly === "true") {
    filter["tags.cleanSetup"] = true;
  }

  return filter;
};

const resolveTradePayload = ({ req, source, files = {} }) => {
  const entryPrice = toNumber(source.entryPrice);
  const stopLoss = toNumber(source.stopLoss);
  const takeProfit = toNumber(source.takeProfit);
  const plannedRR = calculatePlannedRR(entryPrice, stopLoss, takeProfit);
  const result = ensureText(source.result || "BE");
  const computedAchievedRR = calculateAchievedRR(result, plannedRR);
  const rrAchieved =
    source.rrAchieved !== undefined && source.rrAchieved !== ""
      ? toNumber(source.rrAchieved, computedAchievedRR)
      : computedAchievedRR;

  return {
    profileId: resolveProfileId(req, source),
    clientTradeId: ensureText(source.clientTradeId).slice(0, 120),
    pair: ensurePair(source.pair),
    tradeDate: parseDate(source.tradeDate),
    session: ensureText(source.session),
    tradeType: ensureText(source.tradeType),
    setupType: ensureText(source.setupType),
    entryPrice,
    stopLoss,
    takeProfit,
    riskPercent: toNumber(source.riskPercent),
    lotSize: source.lotSize === "" || source.lotSize === undefined ? null : toNumber(source.lotSize, null),
    result,
    plannedRR,
    rrAchieved,
    tags: {
      asiaHighLowUsed: toBoolean(source.asiaHighLowUsed),
      pocInteraction: toBoolean(source.pocInteraction),
      pocOutcome: ensureText(source.pocOutcome),
      cleanSetup: toBoolean(source.cleanSetup),
    },
    notes: {
      priceAction: ensureText(source.priceAction),
      executionReview: ensureText(source.executionReview),
      emotionalState: ensureText(source.emotionalState),
    },
    ruleBreakReason: ensureText(source.ruleBreakReason),
    screenshotFiles: {
      before: files?.screenshotBefore?.[0] || null,
      after: files?.screenshotAfter?.[0] || null,
    },
    screenshotNotes: {
      before: ensureText(source.screenshotBeforeNote).slice(0, 400),
      after: ensureText(source.screenshotAfterNote).slice(0, 400),
    },
  };
};

const validatePayload = (payload) => {
  const requiredFields = ["pair", "session", "tradeType", "setupType", "result"];
  const missing = requiredFields.filter((field) => !payload[field]);
  if (missing.length) {
    const error = new Error(`Missing required fields: ${missing.join(", ")}`);
    error.statusCode = 400;
    throw error;
  }

  ["entryPrice", "stopLoss", "takeProfit"].forEach((field) => {
    if (!Number.isFinite(payload[field])) {
      const error = new Error(`Invalid number for ${field}.`);
      error.statusCode = 400;
      throw error;
    }
  });
};

export const createTrade = async (req, res, next) => {
  try {
    const payload = resolveTradePayload({ req, source: req.body, files: req.files || {} });
    validatePayload(payload);

    const acceptOverride = toBoolean(req.body.acceptGuardrailOverride);

    if (payload.clientTradeId) {
      const existing = await Trade.findOne({
        userId: req.user._id,
        clientTradeId: payload.clientTradeId,
      });

      if (existing) {
        res.status(200).json({
          ...transformTrade(existing, req),
          idempotent: true,
        });
        return;
      }
    }

    const strictChecklistGate = Boolean(req.user?.settings?.riskControls?.strictChecklistGate);
    const checklistAligned = Boolean(
      payload.tags?.asiaHighLowUsed && payload.tags?.pocInteraction && payload.tags?.cleanSetup
    );
    const hasOverrideReason = Boolean(payload.ruleBreakReason);

    if (strictChecklistGate && !checklistAligned && !acceptOverride) {
      res.status(409).json({
        code: "CHECKLIST_GATE_REQUIRED",
        message:
          "Checklist gate is active. Trade must be Asia HL + POC + clean, or save with override reason.",
        checklist: {
          required: true,
          checklistAligned,
        },
      });
      return;
    }

    if (strictChecklistGate && !checklistAligned && acceptOverride && !hasOverrideReason) {
      const error = new Error("Rule-break reason is required when overriding checklist gate.");
      error.statusCode = 400;
      throw error;
    }

    const guardrails = await evaluateGuardrails({
      user: req.user,
      tradeDate: payload.tradeDate,
      session: payload.session,
      tags: payload.tags,
      ruleBreakReason: payload.ruleBreakReason,
    });

    if (guardrails.warnings.length && !acceptOverride) {
      res.status(409).json({
        code: "GUARDRAIL_CONFIRMATION_REQUIRED",
        message: "Guardrails detected caution flags. Confirm to save anyway.",
        guardrails,
      });
      return;
    }

    const [beforeScreenshot, afterScreenshot] = await Promise.all([
      storeScreenshot(payload.screenshotFiles.before),
      storeScreenshot(payload.screenshotFiles.after),
    ]);

    const trade = await Trade.create({
      userId: req.user._id,
      profileId: payload.profileId,
      clientTradeId: payload.clientTradeId,
      pair: payload.pair,
      tradeDate: payload.tradeDate,
      session: payload.session,
      tradeType: payload.tradeType,
      setupType: payload.setupType,
      entryPrice: payload.entryPrice,
      stopLoss: payload.stopLoss,
      takeProfit: payload.takeProfit,
      riskPercent: payload.riskPercent,
      lotSize: payload.lotSize,
      result: payload.result,
      plannedRR: payload.plannedRR,
      rrAchieved: payload.rrAchieved,
      tags: payload.tags,
      notes: payload.notes,
      ruleBreakReason: payload.ruleBreakReason,
      guardrailWarnings: guardrails.warnings,
      screenshots: {
        before: beforeScreenshot.path,
        after: afterScreenshot.path,
        beforeNote: payload.screenshotNotes.before,
        afterNote: payload.screenshotNotes.after,
      },
      storageProvider: [beforeScreenshot.provider, afterScreenshot.provider].filter(Boolean).join(","),
    });

    await recordAudit({
      req,
      userId: req.user._id,
      action: "trade.created",
      targetType: "trade",
      targetId: trade._id.toString(),
      metadata: {
        profileId: trade.profileId,
        pair: trade.pair,
        result: trade.result,
        rrAchieved: trade.rrAchieved,
        clientTradeId: trade.clientTradeId || "",
      },
    });

    res.status(201).json({
      ...transformTrade(trade, req),
      guardrails,
    });
  } catch (error) {
    if (error?.code === 11000 && req.body?.clientTradeId) {
      try {
        const existing = await Trade.findOne({
          userId: req.user._id,
          clientTradeId: ensureText(req.body.clientTradeId),
        });
        if (existing) {
          res.status(200).json({
            ...transformTrade(existing, req),
            idempotent: true,
          });
          return;
        }
      } catch {
        // fall through to generic error handling
      }
    }
    next(error);
  }
};

export const getTrades = async (req, res, next) => {
  try {
    const { limit = "200", page = "1" } = req.query;
    const filter = buildFilterFromRequest(req);

    const safeLimit = Math.min(Math.max(toNumber(limit, 200), 1), 500);
    const safePage = Math.max(toNumber(page, 1), 1);
    const skip = (safePage - 1) * safeLimit;

    const [total, trades] = await Promise.all([
      Trade.countDocuments(filter),
      Trade.find(filter).sort({ tradeDate: -1 }).skip(skip).limit(safeLimit),
    ]);

    res.json({
      total,
      page: safePage,
      pageSize: safeLimit,
      data: trades.map((trade) => transformTrade(trade, req)),
    });
  } catch (error) {
    next(error);
  }
};

export const getAnalytics = async (req, res, next) => {
  try {
    const filter = buildFilterFromRequest(req);
    const trades = await Trade.find(filter).sort({ tradeDate: -1 });
    const analytics = buildDashboardAnalytics(trades.map((trade) => trade.toObject()));
    res.json(analytics);
  } catch (error) {
    next(error);
  }
};

export const exportTradesCsv = async (req, res, next) => {
  try {
    const filter = buildFilterFromRequest(req);
    const trades = await Trade.find(filter).sort({ tradeDate: -1 });
    const csv = buildTradesCsv(trades.map((trade) => trade.toObject()));

    await recordAudit({
      req,
      userId: req.user._id,
      action: "trade.export.csv",
      targetType: "trade",
      metadata: {
        rows: trades.length,
      },
    });

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="trading-journal-${new Date().toISOString().slice(0, 10)}.csv"`
    );
    res.send(csv);
  } catch (error) {
    next(error);
  }
};

const mapCsvRowToPayload = (row = {}, req) => {
  const normalized = resolveTradePayload({ req, source: row });
  if (req?.user?.settings?.riskControls?.requireRuleAlignment) {
    const isAligned = Boolean(normalized.tags.asiaHighLowUsed && normalized.tags.pocInteraction);
    if (!isAligned && !normalized.ruleBreakReason) {
      normalized.ruleBreakReason = "Imported legacy trade without explicit reason.";
    }
  }
  return normalized;
};

const weekRange = (referenceDate = new Date()) => {
  const end = new Date(referenceDate);
  end.setUTCHours(23, 59, 59, 999);

  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);

  return { start, end };
};

const summarizeWeeklyReview = (trades = []) => {
  const total = trades.length;
  const wins = trades.filter((trade) => trade.result === "Win").length;
  const totalRR = trades.reduce((sum, trade) => sum + toNumber(trade.rrAchieved), 0);
  const averageRR = total ? totalRR / total : 0;

  const setups = new Map();
  const emotions = new Map();

  let mistakeCounters = {
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

  const bestSetup = [...setups.entries()]
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

  const biggestMistake = Object.entries(mistakeCounters)
    .map(([key, count]) => ({ key, count }))
    .sort((a, b) => b.count - a.count)[0] || { key: "none", count: 0 };

  const mistakeLabels = {
    nonClean: "Too many non-clean setups",
    noAsiaHL: "Trades without Asia High/Low reaction",
    noPoc: "Trades without POC interaction",
    ruleBreak: "Frequent rule breaks",
    none: "No major recurring mistake detected",
  };

  const topEmotion = [...emotions.entries()]
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

export const getWeeklyReview = async (req, res, next) => {
  try {
    const profileId = resolveProfileId(req);
    const { start, end } = weekRange(new Date());

    const filter = {
      userId: req.user._id,
      tradeDate: { $gte: start, $lte: end },
    };

    const defaultProfileId = resolveDefaultProfileId(req.user);
    if (profileId === defaultProfileId) {
      filter.$or = [{ profileId }, { profileId: { $exists: false } }, { profileId: null }];
    } else {
      filter.profileId = profileId;
    }

    const trades = await Trade.find(filter).sort({ tradeDate: -1 });
    const summary = summarizeWeeklyReview(trades.map((trade) => trade.toObject()));

    await recordAudit({
      req,
      userId: req.user._id,
      action: "review.weekly.viewed",
      targetType: "trade",
      metadata: {
        profileId,
        rows: trades.length,
      },
    });

    res.json({
      generatedAt: new Date().toISOString(),
      profileId,
      periodStart: start.toISOString().slice(0, 10),
      periodEnd: end.toISOString().slice(0, 10),
      summary,
    });
  } catch (error) {
    next(error);
  }
};

export const importTradesCsv = async (req, res, next) => {
  try {
    const csvFile = req.file;
    if (!csvFile?.buffer) {
      const error = new Error("CSV file is required.");
      error.statusCode = 400;
      throw error;
    }

    const rows = parseTradesCsv(csvFile.buffer.toString("utf8"));
    if (!rows.length) {
      const error = new Error("No rows found in CSV.");
      error.statusCode = 400;
      throw error;
    }

    let imported = 0;
    let skipped = 0;
    const errors = [];

    for (let index = 0; index < rows.length; index += 1) {
      const row = rows[index];
      try {
        const payload = mapCsvRowToPayload(row, req);
        validatePayload(payload);

        await Trade.create({
          userId: req.user._id,
          profileId: payload.profileId,
          clientTradeId: payload.clientTradeId,
          pair: payload.pair,
          tradeDate: payload.tradeDate,
          session: payload.session,
          tradeType: payload.tradeType,
          setupType: payload.setupType,
          entryPrice: payload.entryPrice,
          stopLoss: payload.stopLoss,
          takeProfit: payload.takeProfit,
          riskPercent: payload.riskPercent,
          lotSize: payload.lotSize,
          result: payload.result,
          plannedRR: payload.plannedRR,
          rrAchieved: payload.rrAchieved,
          tags: payload.tags,
          notes: payload.notes,
          ruleBreakReason: payload.ruleBreakReason,
          guardrailWarnings: [],
          screenshots: {
            before: ensureText(row.screenshotBefore),
            after: ensureText(row.screenshotAfter),
            beforeNote: ensureText(row.screenshotBeforeNote),
            afterNote: ensureText(row.screenshotAfterNote),
          },
          importSource: "csv",
          storageProvider: "imported",
        });

        imported += 1;
      } catch (error) {
        skipped += 1;
        errors.push({
          row: index + 2,
          message: error.message,
        });
      }
    }

    res.json({
      imported,
      skipped,
      totalRows: rows.length,
      errors: errors.slice(0, 20),
    });

    await recordAudit({
      req,
      userId: req.user._id,
      action: "trade.import.csv",
      targetType: "trade",
      metadata: {
        imported,
        skipped,
        totalRows: rows.length,
      },
    });
  } catch (error) {
    next(error);
  }
};
