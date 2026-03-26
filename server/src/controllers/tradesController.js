import Trade from "../models/Trade.js";
import { buildDashboardAnalytics } from "../services/analytics.js";
import { parseTradesCsv, buildTradesCsv } from "../services/csv.js";
import { evaluateGuardrails } from "../services/guardrails.js";
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

const transformTrade = (trade, req) => ({
  ...trade.toObject(),
  screenshots: {
    before: formatStoredFileUrl(req, trade.screenshots?.before),
    after: formatStoredFileUrl(req, trade.screenshots?.after),
  },
});

const buildFilterFromRequest = (req) => {
  const { pair, session, setupType, cleanOnly = "false" } = req.query;
  const filter = {
    userId: req.user._id,
  };

  applyTextFilter(filter, "pair", pair);
  applyTextFilter(filter, "session", session);
  applyTextFilter(filter, "setupType", setupType);
  if (cleanOnly === "true") {
    filter["tags.cleanSetup"] = true;
  }

  return filter;
};

const resolveTradePayload = ({ source, files = {} }) => {
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
    const payload = resolveTradePayload({ source: req.body, files: req.files || {} });
    validatePayload(payload);

    const guardrails = await evaluateGuardrails({
      user: req.user,
      tradeDate: payload.tradeDate,
      session: payload.session,
      tags: payload.tags,
      ruleBreakReason: payload.ruleBreakReason,
    });

    const acceptOverride = toBoolean(req.body.acceptGuardrailOverride);
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
      },
      storageProvider: [beforeScreenshot.provider, afterScreenshot.provider].filter(Boolean).join(","),
    });

    res.status(201).json({
      ...transformTrade(trade, req),
      guardrails,
    });
  } catch (error) {
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

const mapCsvRowToPayload = (row = {}, user) => {
  const normalized = resolveTradePayload({ source: row });
  if (user?.settings?.riskControls?.requireRuleAlignment) {
    const isAligned = Boolean(normalized.tags.asiaHighLowUsed && normalized.tags.pocInteraction);
    if (!isAligned && !normalized.ruleBreakReason) {
      normalized.ruleBreakReason = "Imported legacy trade without explicit reason.";
    }
  }
  return normalized;
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
        const payload = mapCsvRowToPayload(row, req.user);
        validatePayload(payload);

        await Trade.create({
          userId: req.user._id,
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
  } catch (error) {
    next(error);
  }
};

