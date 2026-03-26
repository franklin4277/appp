import Trade from "../models/Trade.js";
import { buildDashboardAnalytics } from "../services/analytics.js";

const toBoolean = (value) => {
  if (typeof value === "boolean") {
    return value;
  }

  if (typeof value === "string") {
    return value.toLowerCase() === "true";
  }

  return false;
};

const toNumber = (value, fallback = 0) => {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
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
  if (result === "Win") {
    return plannedRR;
  }

  if (result === "Loss") {
    return -1;
  }

  return 0;
};

const buildFileUrl = (req, filePath = "") => {
  if (!filePath) {
    return "";
  }

  return `${req.protocol}://${req.get("host")}/${filePath.replace(/\\/g, "/")}`;
};

const transformTrade = (trade, req) => ({
  ...trade.toObject(),
  screenshots: {
    before: buildFileUrl(req, trade.screenshots?.before),
    after: buildFileUrl(req, trade.screenshots?.after),
  },
});

export const createTrade = async (req, res, next) => {
  try {
    const entryPrice = toNumber(req.body.entryPrice);
    const stopLoss = toNumber(req.body.stopLoss);
    const takeProfit = toNumber(req.body.takeProfit);
    const plannedRR = calculatePlannedRR(entryPrice, stopLoss, takeProfit);
    const result = req.body.result || "BE";
    const computedAchievedRR = calculateAchievedRR(result, plannedRR);
    const rrAchieved =
      req.body.rrAchieved !== undefined
        ? toNumber(req.body.rrAchieved, computedAchievedRR)
        : computedAchievedRR;

    const trade = await Trade.create({
      pair: req.body.pair,
      tradeDate: req.body.tradeDate || new Date(),
      session: req.body.session,
      tradeType: req.body.tradeType,
      setupType: req.body.setupType,
      entryPrice,
      stopLoss,
      takeProfit,
      riskPercent: toNumber(req.body.riskPercent),
      lotSize: req.body.lotSize === "" ? null : toNumber(req.body.lotSize, null),
      result,
      plannedRR,
      rrAchieved,
      tags: {
        asiaHighLowUsed: toBoolean(req.body.asiaHighLowUsed),
        pocInteraction: toBoolean(req.body.pocInteraction),
        pocOutcome: req.body.pocOutcome || "",
        cleanSetup: toBoolean(req.body.cleanSetup),
      },
      notes: {
        priceAction: req.body.priceAction || "",
        executionReview: req.body.executionReview || "",
        emotionalState: req.body.emotionalState || "",
      },
      screenshots: {
        before: req.files?.screenshotBefore?.[0]?.path || "",
        after: req.files?.screenshotAfter?.[0]?.path || "",
      },
    });

    res.status(201).json(transformTrade(trade, req));
  } catch (error) {
    next(error);
  }
};

export const getTrades = async (req, res, next) => {
  try {
    const {
      pair,
      session,
      setupType,
      cleanOnly = "false",
      limit = "200",
      page = "1",
    } = req.query;

    const filter = {};

    if (pair) {
      filter.pair = pair.toUpperCase();
    }
    if (session) {
      filter.session = session;
    }
    if (setupType) {
      filter.setupType = setupType;
    }
    if (cleanOnly === "true") {
      filter["tags.cleanSetup"] = true;
    }

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
    const { pair, session, setupType, cleanOnly = "false" } = req.query;

    const filter = {};

    if (pair) {
      filter.pair = pair.toUpperCase();
    }
    if (session) {
      filter.session = session;
    }
    if (setupType) {
      filter.setupType = setupType;
    }
    if (cleanOnly === "true") {
      filter["tags.cleanSetup"] = true;
    }

    const trades = await Trade.find(filter).sort({ tradeDate: -1 });
    const analytics = buildDashboardAnalytics(trades.map((trade) => trade.toObject()));

    res.json(analytics);
  } catch (error) {
    next(error);
  }
};
