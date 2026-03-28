import crypto from "crypto";
import Trade from "../models/Trade.js";
import WeeklyReviewShare from "../models/WeeklyReviewShare.js";
import { parseTradesCsv, buildTradesCsv } from "../services/csv.js";
import { evaluateGuardrails } from "../services/guardrails.js";
import { hashToken, resolveActiveProfileId, resolveDefaultProfileId } from "../services/auth.js";
import { recordAudit } from "../services/audit.js";
import { summarizeWeeklyReview, weekRange } from "../services/review.js";
import { formatStoredFileUrl, storeScreenshot } from "../services/storage.js";
import {
  getOrBuildAnalyticsSnapshot,
  normalizeAnalyticsFilter,
  scheduleDefaultAnalyticsSnapshotRebuild,
} from "../services/analyticsSnapshot.js";

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

const toPlainTrade = (trade) =>
  trade && typeof trade.toObject === "function" ? trade.toObject() : trade;

const transformTrade = (trade, req) => {
  const plain = toPlainTrade(trade) || {};
  return {
    ...plain,
    screenshots: {
      before: formatStoredFileUrl(req, plain.screenshots?.before),
      after: formatStoredFileUrl(req, plain.screenshots?.after),
    },
  };
};

const applyProfileScopeFilter = ({ filter = {}, user, profileId }) => {
  const next = { ...filter };
  const defaultProfileId = resolveDefaultProfileId(user);

  if (profileId === defaultProfileId) {
    next.$or = [{ profileId }, { profileId: { $exists: false } }, { profileId: null }];
  } else {
    next.profileId = profileId;
  }

  return next;
};

const buildFilterFromRequest = (req) => {
  const { pair, session, setupType, cleanOnly = "false" } = req.query;
  const profileId = resolveProfileId(req);
  const filter = {
    userId: req.user._id,
  };

  const scopedFilter = applyProfileScopeFilter({ filter, user: req.user, profileId });

  applyTextFilter(scopedFilter, "pair", pair);
  applyTextFilter(scopedFilter, "session", session);
  applyTextFilter(scopedFilter, "setupType", setupType);
  if (cleanOnly === "true") {
    scopedFilter["tags.cleanSetup"] = true;
  }

  return scopedFilter;
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

    scheduleDefaultAnalyticsSnapshotRebuild({
      user: req.user,
      profileId: trade.profileId,
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
      Trade.find(filter).sort({ tradeDate: -1 }).skip(skip).limit(safeLimit).lean(),
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
    const profileId = resolveProfileId(req);
    const filter = normalizeAnalyticsFilter(req.query || {});
    const analytics = await getOrBuildAnalyticsSnapshot({
      user: req.user,
      profileId,
      filterInput: filter,
    });
    res.json(analytics);
  } catch (error) {
    next(error);
  }
};

export const exportTradesCsv = async (req, res, next) => {
  try {
    const filter = buildFilterFromRequest(req);
    const trades = await Trade.find(filter).sort({ tradeDate: -1 }).lean();
    const csv = buildTradesCsv(trades);

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

const buildWeeklyReviewPayload = async ({ user, profileId }) => {
  const { start, end } = weekRange(new Date());
  const baseFilter = {
    userId: user._id,
    tradeDate: { $gte: start, $lte: end },
  };
  const filter = applyProfileScopeFilter({
    filter: baseFilter,
    user,
    profileId,
  });

  const trades = await Trade.find(filter).sort({ tradeDate: -1 }).lean();
  const summary = summarizeWeeklyReview(trades);

  return {
    generatedAt: new Date().toISOString(),
    profileId,
    periodStart: start.toISOString().slice(0, 10),
    periodEnd: end.toISOString().slice(0, 10),
    summary,
    rows: trades.length,
  };
};

export const getWeeklyReview = async (req, res, next) => {
  try {
    const profileId = resolveProfileId(req);
    const review = await buildWeeklyReviewPayload({
      user: req.user,
      profileId,
    });

    await recordAudit({
      req,
      userId: req.user._id,
      action: "review.weekly.viewed",
      targetType: "trade",
      metadata: {
        profileId,
        rows: review.rows,
      },
    });

    res.json(review);
  } catch (error) {
    next(error);
  }
};

const sanitizeShareTitle = (value = "", fallback = "") => {
  const title = ensureText(value).slice(0, 120);
  if (title) {
    return title;
  }
  return ensureText(fallback).slice(0, 120) || "Weekly report";
};

const clampShareExpiryDays = (value, fallback = 7) => Math.min(Math.max(toNumber(value, fallback), 1), 90);

const resolveShareBaseUrl = (req) => {
  const envBase =
    String(process.env.PUBLIC_SHARE_BASE_URL || "").trim() ||
    String(process.env.CLIENT_URL || "")
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean)[0];

  if (envBase) {
    return envBase.replace(/\/$/, "");
  }

  return `${req.protocol}://${req.get("host")}`;
};

export const createSharedWeeklyReview = async (req, res, next) => {
  try {
    const profileId = resolveProfileId(req, req.body || {});
    const review = await buildWeeklyReviewPayload({
      user: req.user,
      profileId,
    });

    const shareToken = crypto.randomBytes(24).toString("hex");
    const expiresInDays = clampShareExpiryDays(req.body?.expiresInDays, 7);
    const expiresAt = new Date(Date.now() + expiresInDays * 24 * 60 * 60 * 1000);
    const title = sanitizeShareTitle(req.body?.title, `${review.periodStart} to ${review.periodEnd}`);

    const created = await WeeklyReviewShare.create({
      userId: req.user._id,
      profileId,
      tokenHash: hashToken(shareToken),
      title,
      periodStart: review.periodStart,
      periodEnd: review.periodEnd,
      summary: review.summary,
      generatedAt: review.generatedAt,
      expiresAt,
    });

    const sharePath = `/shared/${shareToken}`;
    const shareUrl = `${resolveShareBaseUrl(req)}${sharePath}`;
    const apiUrl = `${req.protocol}://${req.get("host")}/api/trades/review/shared/${shareToken}`;

    await recordAudit({
      req,
      userId: req.user._id,
      action: "review.weekly.share.created",
      targetType: "weekly-share",
      targetId: created._id.toString(),
      metadata: {
        profileId,
        periodStart: created.periodStart,
        periodEnd: created.periodEnd,
        expiresAt: created.expiresAt.toISOString(),
      },
    });

    res.status(201).json({
      id: created._id.toString(),
      profileId: created.profileId,
      title: created.title,
      periodStart: created.periodStart,
      periodEnd: created.periodEnd,
      expiresAt: created.expiresAt.toISOString(),
      shareUrl,
      apiUrl,
    });
  } catch (error) {
    next(error);
  }
};

export const listWeeklyReviewShares = async (req, res, next) => {
  try {
    const shares = await WeeklyReviewShare.find({
      userId: req.user._id,
      revokedAt: null,
    })
      .sort({ createdAt: -1 })
      .limit(30);

    res.json({
      data: shares.map((share) => ({
        id: share._id.toString(),
        profileId: share.profileId,
        title: share.title,
        periodStart: share.periodStart,
        periodEnd: share.periodEnd,
        expiresAt: share.expiresAt.toISOString(),
        createdAt: share.createdAt?.toISOString?.() || null,
        lastAccessedAt: share.lastAccessedAt?.toISOString?.() || null,
        isExpired: new Date(share.expiresAt).getTime() <= Date.now(),
      })),
    });
  } catch (error) {
    next(error);
  }
};

export const revokeWeeklyReviewShare = async (req, res, next) => {
  try {
    const shareId = ensureText(req.params.shareId);
    if (!shareId || !/^[a-f0-9]{24}$/i.test(shareId)) {
      const error = new Error("shareId is required.");
      error.statusCode = 400;
      throw error;
    }

    const share = await WeeklyReviewShare.findOne({
      _id: shareId,
      userId: req.user._id,
      revokedAt: null,
    });

    if (!share) {
      const error = new Error("Shared report not found.");
      error.statusCode = 404;
      throw error;
    }

    share.revokedAt = new Date();
    await share.save();

    await recordAudit({
      req,
      userId: req.user._id,
      action: "review.weekly.share.revoked",
      targetType: "weekly-share",
      targetId: share._id.toString(),
      metadata: {
        profileId: share.profileId,
      },
    });

    res.json({ ok: true });
  } catch (error) {
    next(error);
  }
};

export const getSharedWeeklyReview = async (req, res, next) => {
  try {
    const token = ensureText(req.params.token);
    if (!token) {
      const error = new Error("Shared review not found.");
      error.statusCode = 404;
      throw error;
    }

    const share = await WeeklyReviewShare.findOne({
      tokenHash: hashToken(token),
      revokedAt: null,
      expiresAt: { $gt: new Date() },
    });

    if (!share) {
      const error = new Error("Shared review link is invalid or expired.");
      error.statusCode = 404;
      throw error;
    }

    share.lastAccessedAt = new Date();
    await share.save();

    await recordAudit({
      req,
      userId: share.userId,
      action: "review.weekly.share.viewed",
      targetType: "weekly-share",
      targetId: share._id.toString(),
      metadata: {
        profileId: share.profileId,
      },
    });

    res.json({
      shared: true,
      readOnly: true,
      title: share.title,
      profileId: share.profileId,
      periodStart: share.periodStart,
      periodEnd: share.periodEnd,
      generatedAt: new Date(share.generatedAt).toISOString(),
      expiresAt: new Date(share.expiresAt).toISOString(),
      summary: share.summary || {},
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
    const touchedProfiles = new Set();

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

        touchedProfiles.add(payload.profileId);

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

    touchedProfiles.forEach((profileId) => {
      scheduleDefaultAnalyticsSnapshotRebuild({
        user: req.user,
        profileId,
      });
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
