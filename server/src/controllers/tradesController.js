import crypto from "crypto";
import Trade from "../models/Trade.js";
import BridgeIngestEvent from "../models/BridgeIngestEvent.js";
import User from "../models/User.js";
import WeeklyReviewShare from "../models/WeeklyReviewShare.js";
import { parseTradesCsv, buildTradesCsv } from "../services/csv.js";
import { evaluateGuardrails } from "../services/guardrails.js";
import {
  ensureUserProfiles,
  hashToken,
  resolveActiveProfileId,
  resolveDefaultProfileId,
} from "../services/auth.js";
import { recordAudit } from "../services/audit.js";
import { summarizeWeeklyReview, weekRange } from "../services/review.js";
import { formatStoredFileUrl } from "../services/storage.js";
import {
  assertBridgeIpAllowed,
  assertBridgeNonceUnused,
  pickRequestIp,
  verifyBridgeHmac,
} from "../services/bridgeSecurity.js";
import { enqueueTradeMediaProcessing } from "../services/mediaQueue.js";
import { buildStrategyFingerprint, computeQualityFlags } from "../services/tradeInsights.js";
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

const parseOptionalDate = (value) => {
  if (value === undefined || value === null || value === "") {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date;
};

const ensurePair = (value = "") => String(value || "").trim().toUpperCase();
const ensureText = (value = "") => String(value || "").trim();
const ensureLowerText = (value = "") => ensureText(value).toLowerCase();
const isHttpUrl = (value = "") => /^https?:\/\//i.test(String(value || "").trim());
const BRIDGE_MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const BRIDGE_ALLOWED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp"]);
const BRIDGE_EVENT_RETENTION_DAYS = Math.max(Number(process.env.BRIDGE_EVENT_RETENTION_DAYS || 45) || 45, 7);
const BRIDGE_MAX_RECORDING_SECONDS = Math.max(Number(process.env.BRIDGE_MAX_RECORDING_SECONDS || 20) || 20, 5);
const BRIDGE_RECORDING_ENABLED = String(process.env.BRIDGE_ENABLE_RECORDINGS || "").toLowerCase() === "true";

const unauthorized = (message = "Bridge authentication failed.") => {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
};

const stableStringify = (value) => {
  const visited = new WeakSet();
  const normalize = (input) => {
    if (input === null || typeof input !== "object") {
      return input;
    }
    if (visited.has(input)) {
      return null;
    }
    visited.add(input);

    if (Array.isArray(input)) {
      return input.map((item) => normalize(item));
    }

    return Object.keys(input)
      .sort()
      .reduce((acc, key) => {
        acc[key] = normalize(input[key]);
        return acc;
      }, {});
  };

  try {
    return JSON.stringify(normalize(value));
  } catch {
    return JSON.stringify({});
  }
};

const firstNonEmpty = (...values) => {
  for (const value of values) {
    if (value === 0) {
      return value;
    }
    const text = ensureText(value);
    if (text) {
      return value;
    }
  }
  return "";
};

const toFiniteOrNaN = (value) => {
  const number = Number(value);
  return Number.isFinite(number) ? number : Number.NaN;
};

const deriveSessionFromDate = (date) => {
  const hour = Number(date?.getHours?.() || 0);
  if (hour < 7) {
    return "Asia";
  }
  if (hour < 13) {
    return "London";
  }
  return "New York";
};

const normalizeTradeType = (value = "") => {
  const normalized = ensureLowerText(value);
  if (!normalized) {
    return "";
  }
  if (normalized.startsWith("buy")) {
    return "Buy";
  }
  if (normalized.startsWith("sell")) {
    return "Sell";
  }
  return ensureText(value);
};

const normalizeBridgeEventType = (value = "") => {
  const normalized = ensureLowerText(value);
  if (["entry", "open", "opened"].includes(normalized)) {
    return "entry";
  }
  if (["exit", "close", "closed"].includes(normalized)) {
    return "exit";
  }
  return "full";
};

const inferResultFromExit = ({ tradeType, entryPrice, exitPrice }) => {
  if (!Number.isFinite(entryPrice) || !Number.isFinite(exitPrice)) {
    return "BE";
  }

  if (tradeType === "Buy") {
    if (exitPrice > entryPrice) {
      return "Win";
    }
    if (exitPrice < entryPrice) {
      return "Loss";
    }
    return "BE";
  }

  if (tradeType === "Sell") {
    if (exitPrice < entryPrice) {
      return "Win";
    }
    if (exitPrice > entryPrice) {
      return "Loss";
    }
    return "BE";
  }

  return "BE";
};

const sanitizeBridgeRecordingUrl = (value = "") => {
  if (!BRIDGE_RECORDING_ENABLED) {
    return "";
  }

  const url = ensureText(value);
  if (!url) {
    return "";
  }
  if (!isHttpUrl(url)) {
    const error = new Error("screenRecordingUrl must be an http(s) URL.");
    error.statusCode = 400;
    throw error;
  }
  return url.slice(0, 900);
};

const sanitizeRecordingDurationSeconds = (value) => {
  const parsed = toNumber(value, 0);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return Math.min(Math.round(parsed), BRIDGE_MAX_RECORDING_SECONDS);
};

const parseBase64Screenshot = (value = "", fallbackName = "bridge-shot") => {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  let mimeType = "image/png";
  let encoded = raw;

  const dataMatch = raw.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (dataMatch) {
    mimeType = ensureLowerText(dataMatch[1]);
    encoded = dataMatch[2];
  }

  if (!BRIDGE_ALLOWED_IMAGE_MIME.has(mimeType)) {
    const error = new Error("Screenshot mime type must be PNG, JPG, or WEBP.");
    error.statusCode = 400;
    throw error;
  }

  let buffer;
  try {
    buffer = Buffer.from(encoded, "base64");
  } catch {
    const error = new Error("Invalid base64 screenshot payload.");
    error.statusCode = 400;
    throw error;
  }

  if (!buffer?.length) {
    const error = new Error("Screenshot payload is empty.");
    error.statusCode = 400;
    throw error;
  }

  if (buffer.length > BRIDGE_MAX_IMAGE_BYTES) {
    const error = new Error("Screenshot payload exceeds 5MB.");
    error.statusCode = 400;
    throw error;
  }

  const extMap = {
    "image/png": "png",
    "image/jpeg": "jpg",
    "image/jpg": "jpg",
    "image/webp": "webp",
  };
  const ext = extMap[mimeType] || "png";

  return {
    buffer,
    mimetype: mimeType,
    originalname: `${fallbackName}.${ext}`,
  };
};

const parseBridgeScreenshotInput = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) {
    return {
      url: "",
      base64: "",
    };
  }

  if (isHttpUrl(raw)) {
    return {
      url: raw,
      base64: "",
    };
  }

  return {
    url: "",
    base64: raw,
  };
};

const resolveBridgeScreenshotTask = ({
  rawInput = "",
  explicitUrl = "",
  explicitBase64 = "",
  fallbackName = "bridge-shot",
  slot = "before",
}) => {
  const preferredUrl = ensureText(explicitUrl);
  if (preferredUrl) {
    if (!isHttpUrl(preferredUrl)) {
      const error = new Error("Screenshot URL must be an http(s) URL.");
      error.statusCode = 400;
      throw error;
    }
    return {
      kind: "url",
      url: preferredUrl,
      slot,
      autoCaptured: true,
    };
  }

  const preferredBase64 = ensureText(explicitBase64);
  if (preferredBase64) {
    const file = parseBase64Screenshot(preferredBase64, fallbackName);
    return {
      kind: "file",
      file,
      slot,
      autoCaptured: true,
    };
  }

  const parsed = parseBridgeScreenshotInput(rawInput);
  if (parsed.url) {
    return {
      kind: "url",
      url: parsed.url,
      slot,
      autoCaptured: true,
    };
  }
  if (parsed.base64) {
    const file = parseBase64Screenshot(parsed.base64, fallbackName);
    return {
      kind: "file",
      file,
      slot,
      autoCaptured: true,
    };
  }

  return null;
};

const buildBridgeApiKeyCandidates = (req) => {
  const authorization = String(req.headers.authorization || "").trim();
  const bearer = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice("bearer ".length).trim()
    : "";

  return [
    req.headers["x-integration-key"],
    req.headers["x-api-key"],
    req.headers["x-mt5-key"],
    bearer,
    req.query?.apiKey,
    req.body?.apiKey,
  ]
    .map((item) => ensureText(item))
    .filter(Boolean);
};

const resolveBridgeUser = async (req) => {
  assertBridgeIpAllowed(req);

  const candidates = buildBridgeApiKeyCandidates(req);
  if (!candidates.length) {
    throw unauthorized("Bridge key is required.");
  }

  const keyHashes = [...new Set(candidates.map((key) => hashToken(key)))];
  const user = await User.findOne({
    "integrations.mt5.enabled": true,
    "integrations.mt5.keyHash": {
      $in: keyHashes,
    },
  });

  if (!user) {
    throw unauthorized("Bridge key is invalid.");
  }

  const matchedKey = candidates.find((candidate) => hashToken(candidate) === String(user.integrations?.mt5?.keyHash));
  if (!matchedKey) {
    throw unauthorized("Bridge key mismatch.");
  }

  const security = verifyBridgeHmac({
    req,
    integrationKey: matchedKey,
  });
  await assertBridgeNonceUnused({
    userId: user._id,
    nonceHash: security.nonceHash,
    ttlSeconds: security.nonceTtlSeconds,
  });

  ensureUserProfiles(user);
  return {
    user,
    integrationKey: matchedKey,
    security,
  };
};

const resolveBridgeTradePayload = ({ req, source = {} }) => {
  const tradeSource = source?.trade && typeof source.trade === "object" ? source.trade : source;
  const tagsSource = source?.tags && typeof source.tags === "object" ? source.tags : tradeSource;
  const notesSource = source?.notes && typeof source.notes === "object" ? source.notes : tradeSource;
  const screenshotSource =
    source?.screenshots && typeof source.screenshots === "object" ? source.screenshots : {};
  const mt5Source = source?.mt5 && typeof source.mt5 === "object" ? source.mt5 : {};
  const eventType = normalizeBridgeEventType(firstNonEmpty(source.eventType, tradeSource.eventType));

  const entryTimeRaw = firstNonEmpty(
    tradeSource.tradeDate,
    tradeSource.entryTime,
    tradeSource.openTime,
    source.tradeDate,
    source.entryTime
  );
  const tradeDate = parseDate(entryTimeRaw || new Date());

  const entryPrice = toFiniteOrNaN(firstNonEmpty(tradeSource.entryPrice, tradeSource.openPrice, source.entryPrice));
  const stopLoss = toFiniteOrNaN(firstNonEmpty(tradeSource.stopLoss, tradeSource.sl, source.stopLoss));
  const takeProfit = toFiniteOrNaN(firstNonEmpty(tradeSource.takeProfit, tradeSource.tp, source.takeProfit));
  const tradeType = normalizeTradeType(firstNonEmpty(tradeSource.tradeType, tradeSource.type, source.tradeType));
  const exitPrice = toFiniteOrNaN(firstNonEmpty(tradeSource.exitPrice, tradeSource.closePrice, source.exitPrice));
  const exitTime = parseOptionalDate(firstNonEmpty(tradeSource.exitTime, tradeSource.closeTime, source.exitTime));
  const providedResult = ensureText(firstNonEmpty(tradeSource.result, source.result));
  const normalizedResult = providedResult || inferResultFromExit({ tradeType, entryPrice, exitPrice });

  const plannedRR = calculatePlannedRR(entryPrice, stopLoss, takeProfit);
  const rrAchieved = firstNonEmpty(tradeSource.rrAchieved, source.rrAchieved);
  const computedAchievedRR = calculateAchievedRR(normalizedResult || "BE", plannedRR);

  return {
    profileId: resolveProfileId(req, {
      profileId: firstNonEmpty(source.profileId, tradeSource.profileId),
    }),
    clientTradeId: ensureText(firstNonEmpty(tradeSource.clientTradeId, source.clientTradeId)).slice(0, 120),
    pair: ensurePair(firstNonEmpty(tradeSource.pair, tradeSource.symbol, mt5Source.symbol, source.pair)),
    tradeDate,
    session: ensureText(firstNonEmpty(tradeSource.session, source.session)) || deriveSessionFromDate(tradeDate),
    tradeType,
    setupType:
      ensureText(firstNonEmpty(tradeSource.setupType, source.setupType, source.strategyName)) || "Auto Imported",
    entryPrice,
    stopLoss,
    takeProfit,
    riskPercent: toNumber(firstNonEmpty(tradeSource.riskPercent, source.riskPercent), 0),
    lotSize:
      firstNonEmpty(tradeSource.lotSize, tradeSource.volume, source.lotSize) === ""
        ? null
        : toNumber(firstNonEmpty(tradeSource.lotSize, tradeSource.volume, source.lotSize), null),
    result: normalizedResult || "BE",
    plannedRR,
    rrAchieved: rrAchieved === "" ? computedAchievedRR : toNumber(rrAchieved, computedAchievedRR),
    tags: {
      asiaHighLowUsed: toBoolean(
        firstNonEmpty(tagsSource.asiaHighLowUsed, source.asiaHighLowUsed, source.strategy?.asiaHighLowUsed)
      ),
      pocInteraction: toBoolean(
        firstNonEmpty(tagsSource.pocInteraction, source.pocInteraction, source.strategy?.pocInteraction)
      ),
      pocOutcome: ensureText(firstNonEmpty(tagsSource.pocOutcome, source.pocOutcome)),
      cleanSetup: toBoolean(firstNonEmpty(tagsSource.cleanSetup, source.cleanSetup)),
    },
    notes: {
      priceAction: ensureText(firstNonEmpty(notesSource.priceAction, source.priceAction)),
      executionReview: ensureText(firstNonEmpty(notesSource.executionReview, source.executionReview)),
      emotionalState: ensureText(firstNonEmpty(notesSource.emotionalState, source.emotionalState)),
    },
    ruleBreakReason: ensureText(firstNonEmpty(tradeSource.ruleBreakReason, source.ruleBreakReason)),
    screenshotInputs: {
      beforeRaw: firstNonEmpty(screenshotSource.before, source.screenshotBefore),
      beforeUrl: firstNonEmpty(screenshotSource.beforeUrl, source.screenshotBeforeUrl),
      beforeBase64: firstNonEmpty(
        screenshotSource.beforeBase64,
        screenshotSource.beforeDataUrl,
        source.screenshotBeforeBase64
      ),
      afterRaw: firstNonEmpty(screenshotSource.after, source.screenshotAfter),
      afterUrl: firstNonEmpty(screenshotSource.afterUrl, source.screenshotAfterUrl),
      afterBase64: firstNonEmpty(
        screenshotSource.afterBase64,
        screenshotSource.afterDataUrl,
        source.screenshotAfterBase64
      ),
    },
    screenshotNotes: {
      before: ensureText(firstNonEmpty(screenshotSource.beforeNote, source.screenshotBeforeNote)).slice(0, 400),
      after: ensureText(firstNonEmpty(screenshotSource.afterNote, source.screenshotAfterNote)).slice(0, 400),
    },
    automation: {
      source: ensureLowerText(firstNonEmpty(source.source, source.bridge, tradeSource.source)) || "mt5",
      bridge: ensureLowerText(firstNonEmpty(source.bridge, "mt5")).slice(0, 40),
      status: eventType === "entry" ? "open" : "closed",
      eventType,
      externalTradeId: ensureText(
        firstNonEmpty(
          source.externalTradeId,
          tradeSource.externalTradeId,
          mt5Source.positionId,
          mt5Source.ticket,
          tradeSource.positionId,
          tradeSource.ticket
        )
      ).slice(0, 120),
      mt5AccountId: ensureText(firstNonEmpty(mt5Source.accountId, source.accountId, tradeSource.accountId)).slice(
        0,
        120
      ),
      mt5PositionId: ensureText(firstNonEmpty(mt5Source.positionId, tradeSource.positionId)).slice(0, 120),
      mt5OrderId: ensureText(firstNonEmpty(mt5Source.orderId, tradeSource.orderId, tradeSource.ticket)).slice(
        0,
        120
      ),
      screenRecordingUrl: sanitizeBridgeRecordingUrl(
        firstNonEmpty(source.screenRecordingUrl, source.recordingUrl, tradeSource.screenRecordingUrl)
      ),
      recordingDurationSeconds: sanitizeRecordingDurationSeconds(
        firstNonEmpty(source.recordingDurationSeconds, tradeSource.recordingDurationSeconds)
      ),
      exitPrice: Number.isFinite(exitPrice) ? exitPrice : null,
      exitTime,
    },
  };
};

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

const tradeListProjection = {
  _id: 1,
  profileId: 1,
  clientTradeId: 1,
  pair: 1,
  tradeDate: 1,
  session: 1,
  tradeType: 1,
  setupType: 1,
  strategyFingerprint: 1,
  result: 1,
  rrAchieved: 1,
  tags: 1,
  qualityFlags: 1,
  ruleBreakReason: 1,
  automation: 1,
  mediaProcessing: 1,
  "notes.emotionalState": 1,
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

const deriveTradeComputedState = ({ payload, lifecycleEvent = "manual" }) => {
  const normalizedEvent = ensureLowerText(lifecycleEvent || "manual");
  const isEntryOnly = normalizedEvent === "entry";
  const result = isEntryOnly ? "BE" : payload.result;
  const rrAchieved = isEntryOnly ? 0 : payload.rrAchieved;
  const strategyFingerprint = buildStrategyFingerprint(payload);
  const qualityFlags = computeQualityFlags({
    entryPrice: payload.entryPrice,
    stopLoss: payload.stopLoss,
    takeProfit: payload.takeProfit,
    plannedRR: payload.plannedRR,
    rrAchieved,
    result,
    eventType: normalizedEvent,
    exitTime: payload.automation?.exitTime || null,
    tradeDate: payload.tradeDate,
    recordingDurationSeconds: payload.automation?.recordingDurationSeconds || 0,
  });

  return {
    result,
    rrAchieved,
    strategyFingerprint,
    qualityFlags,
  };
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

    const derived = deriveTradeComputedState({
      payload,
      lifecycleEvent: "manual",
    });
    const hasQueuedMedia = Boolean(payload.screenshotFiles.before || payload.screenshotFiles.after);

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
      result: derived.result,
      plannedRR: payload.plannedRR,
      rrAchieved: derived.rrAchieved,
      strategyFingerprint: derived.strategyFingerprint,
      tags: payload.tags,
      notes: payload.notes,
      ruleBreakReason: payload.ruleBreakReason,
      guardrailWarnings: guardrails.warnings,
      qualityFlags: derived.qualityFlags,
      screenshots: {
        before: "",
        after: "",
        beforeNote: payload.screenshotNotes.before,
        afterNote: payload.screenshotNotes.after,
      },
      storageProvider: "",
      mediaProcessing: {
        status: hasQueuedMedia ? "queued" : "ready",
        pendingItems: hasQueuedMedia
          ? [payload.screenshotFiles.before ? "before" : "", payload.screenshotFiles.after ? "after" : ""].filter(
              Boolean
            )
          : [],
        lastError: "",
        queuedAt: hasQueuedMedia ? new Date() : null,
        updatedAt: new Date(),
      },
      automation: {
        source: "manual",
        bridge: "",
        status: "closed",
        eventType: "manual",
        externalTradeId: "",
        lastSyncAt: new Date(),
      },
    });

    if (hasQueuedMedia) {
      await enqueueTradeMediaProcessing({
        tradeId: trade._id,
        source: "manual",
        beforeTask: payload.screenshotFiles.before
          ? {
              kind: "file",
              file: payload.screenshotFiles.before,
              slot: "before",
              autoCaptured: false,
              note: payload.screenshotNotes.before,
            }
          : null,
        afterTask: payload.screenshotFiles.after
          ? {
              kind: "file",
              file: payload.screenshotFiles.after,
              slot: "after",
              autoCaptured: false,
              note: payload.screenshotNotes.after,
            }
          : null,
      });
    }

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

const bridgeEventExpiresAt = () => new Date(Date.now() + BRIDGE_EVENT_RETENTION_DAYS * 24 * 60 * 60 * 1000);

const safeBridgePayloadForStorage = (payload = {}) => {
  const cloned = JSON.parse(JSON.stringify(payload || {}));
  const maxLen = 120;

  const redactIfLong = (value) => {
    const text = ensureText(value);
    if (!text || text.length <= maxLen) {
      return text;
    }
    return `[omitted:${text.length} chars]`;
  };

  if (cloned?.screenshots && typeof cloned.screenshots === "object") {
    if (cloned.screenshots.beforeBase64) {
      cloned.screenshots.beforeBase64 = redactIfLong(cloned.screenshots.beforeBase64);
    }
    if (cloned.screenshots.afterBase64) {
      cloned.screenshots.afterBase64 = redactIfLong(cloned.screenshots.afterBase64);
    }
    if (cloned.screenshots.beforeDataUrl) {
      cloned.screenshots.beforeDataUrl = redactIfLong(cloned.screenshots.beforeDataUrl);
    }
    if (cloned.screenshots.afterDataUrl) {
      cloned.screenshots.afterDataUrl = redactIfLong(cloned.screenshots.afterDataUrl);
    }
  }

  if (cloned.screenshotBeforeBase64) {
    cloned.screenshotBeforeBase64 = redactIfLong(cloned.screenshotBeforeBase64);
  }
  if (cloned.screenshotAfterBase64) {
    cloned.screenshotAfterBase64 = redactIfLong(cloned.screenshotAfterBase64);
  }

  return cloned;
};

export const createTradeFromBridge = async (req, res, next) => {
  let bridgeEvent = null;
  let bridgeContext = null;

  try {
    bridgeContext = await resolveBridgeUser(req);
    const { user, security } = bridgeContext;
    req.user = user;

    const payload = resolveBridgeTradePayload({
      req,
      source: req.body || {},
    });
    validatePayload(payload);

    if (!payload.automation.externalTradeId) {
      const error = new Error("externalTradeId is required for bridge sync.");
      error.statusCode = 400;
      throw error;
    }

    const eventType = payload.automation.eventType || "full";
    const shouldCloseTrade = eventType !== "entry";
    const derived = deriveTradeComputedState({
      payload,
      lifecycleEvent: eventType,
    });
    const requestPayloadDigest = crypto
      .createHash("sha256")
      .update(String(req.rawBody || stableStringify(req.body || {})))
      .digest("hex");

    const normalizedEventPayload = {
      profileId: payload.profileId,
      pair: payload.pair,
      session: payload.session,
      setupType: payload.setupType,
      eventType,
      trade: {
        result: derived.result,
        rrAchieved: derived.rrAchieved,
        plannedRR: payload.plannedRR,
      },
      automation: {
        ...payload.automation,
        status: shouldCloseTrade ? "closed" : "open",
      },
      tags: payload.tags,
      strategyFingerprint: derived.strategyFingerprint,
      qualityFlags: derived.qualityFlags,
    };

    try {
      bridgeEvent = await BridgeIngestEvent.create({
        userId: user._id,
        profileId: payload.profileId,
        bridge: payload.automation.bridge || "mt5",
        source: payload.automation.source || "mt5",
        externalTradeId: payload.automation.externalTradeId,
        eventType,
        payloadRaw: safeBridgePayloadForStorage(req.body || {}),
        payloadNormalized: normalizedEventPayload,
        payloadDigest: requestPayloadDigest,
        requestMeta: {
          ip: pickRequestIp(req),
          userAgent: String(req.headers["user-agent"] || "").slice(0, 300),
          signatureVerified: Boolean(security.signatureVerified),
          nonceHash: security.nonceHash || "",
          timestamp: security.timestamp || "",
        },
        status: "received",
        attempts: 0,
        expiresAt: bridgeEventExpiresAt(),
      });
    } catch (eventError) {
      if (eventError?.code !== 11000) {
        throw eventError;
      }

      bridgeEvent = await BridgeIngestEvent.findOne({
        userId: user._id,
        payloadDigest: requestPayloadDigest,
      });

      if (bridgeEvent?.status === "processed") {
        const existingProcessedTrade = await Trade.findOne({
          userId: user._id,
          "automation.externalTradeId": payload.automation.externalTradeId,
        });
        if (existingProcessedTrade) {
          res.status(200).json({
            ...transformTrade(existingProcessedTrade, req),
            idempotent: true,
            synced: true,
            eventType,
          });
          return;
        }
      }
    }

    const beforeMediaTask = resolveBridgeScreenshotTask({
      rawInput: payload.screenshotInputs.beforeRaw,
      explicitUrl: payload.screenshotInputs.beforeUrl,
      explicitBase64: payload.screenshotInputs.beforeBase64,
      fallbackName: `entry-${payload.automation.externalTradeId}`,
      slot: "before",
    });
    const afterMediaTask = resolveBridgeScreenshotTask({
      rawInput: payload.screenshotInputs.afterRaw,
      explicitUrl: payload.screenshotInputs.afterUrl,
      explicitBase64: payload.screenshotInputs.afterBase64,
      fallbackName: `exit-${payload.automation.externalTradeId}`,
      slot: "after",
    });
    const hasMediaTasks = Boolean(beforeMediaTask || afterMediaTask);

    const guardrails = await evaluateGuardrails({
      user,
      tradeDate: payload.tradeDate,
      session: payload.session,
      tags: payload.tags,
      ruleBreakReason: payload.ruleBreakReason,
    });

    const now = new Date();
    const existing = await Trade.findOne({
      userId: user._id,
      "automation.externalTradeId": payload.automation.externalTradeId,
    });

    let trade = existing;
    let created = false;

    if (!trade) {
      trade = await Trade.create({
        userId: user._id,
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
        result: derived.result,
        plannedRR: payload.plannedRR,
        rrAchieved: derived.rrAchieved,
        strategyFingerprint: derived.strategyFingerprint,
        tags: payload.tags,
        notes: payload.notes,
        ruleBreakReason: payload.ruleBreakReason,
        guardrailWarnings: guardrails.warnings,
        qualityFlags: derived.qualityFlags,
        screenshots: {
          before: "",
          after: "",
          beforeNote: payload.screenshotNotes.before,
          afterNote: payload.screenshotNotes.after,
        },
        importSource: "bridge",
        storageProvider: "",
        mediaProcessing: {
          status: hasMediaTasks ? "queued" : "ready",
          pendingItems: hasMediaTasks
            ? [beforeMediaTask ? "before" : "", afterMediaTask ? "after" : ""].filter(Boolean)
            : [],
          lastError: "",
          queuedAt: hasMediaTasks ? now : null,
          updatedAt: now,
        },
        automation: {
          ...payload.automation,
          source: payload.automation.source || "mt5",
          bridge: payload.automation.bridge || "mt5",
          status: shouldCloseTrade ? "closed" : "open",
          autoCapturedBefore: false,
          autoCapturedAfter: false,
          entryCapturedAt: null,
          exitCapturedAt: null,
          exitPrice: shouldCloseTrade ? payload.automation.exitPrice : null,
          exitTime: shouldCloseTrade ? payload.automation.exitTime || now : null,
          rawPayloadDigest: requestPayloadDigest,
          lastSyncAt: now,
        },
      });
      created = true;
    } else {
      trade.profileId = payload.profileId || trade.profileId;
      trade.clientTradeId = payload.clientTradeId || trade.clientTradeId;
      trade.pair = payload.pair;
      trade.tradeDate = payload.tradeDate;
      trade.session = payload.session;
      trade.tradeType = payload.tradeType;
      trade.setupType = payload.setupType;
      trade.entryPrice = payload.entryPrice;
      trade.stopLoss = payload.stopLoss;
      trade.takeProfit = payload.takeProfit;
      trade.riskPercent = payload.riskPercent;
      trade.lotSize = payload.lotSize;

      // Entry syncs should not overwrite a previously closed final result.
      if (shouldCloseTrade || trade.automation?.status !== "closed") {
        trade.result = derived.result;
        trade.rrAchieved = derived.rrAchieved;
      }

      trade.plannedRR = payload.plannedRR;
      trade.strategyFingerprint = derived.strategyFingerprint;
      trade.tags = payload.tags;
      trade.notes = payload.notes;
      trade.ruleBreakReason = payload.ruleBreakReason;
      trade.guardrailWarnings = guardrails.warnings;
      trade.qualityFlags = [...new Set([...(trade.qualityFlags || []), ...derived.qualityFlags])];
      trade.importSource = "bridge";
      trade.screenshots = trade.screenshots || {};
      if (payload.screenshotNotes.before) {
        trade.screenshots.beforeNote = payload.screenshotNotes.before;
      }
      if (payload.screenshotNotes.after) {
        trade.screenshots.afterNote = payload.screenshotNotes.after;
      }

      trade.mediaProcessing = {
        ...(trade.mediaProcessing || {}),
        status: hasMediaTasks ? "queued" : trade.mediaProcessing?.status || "ready",
        pendingItems: hasMediaTasks
          ? [beforeMediaTask ? "before" : "", afterMediaTask ? "after" : ""].filter(Boolean)
          : [],
        lastError: "",
        queuedAt: hasMediaTasks ? now : trade.mediaProcessing?.queuedAt || null,
        updatedAt: now,
      };

      trade.automation = {
        ...(trade.automation || {}),
        ...payload.automation,
        source: payload.automation.source || trade.automation?.source || "mt5",
        bridge: payload.automation.bridge || trade.automation?.bridge || "mt5",
        status: shouldCloseTrade ? "closed" : trade.automation?.status || "open",
        eventType,
        rawPayloadDigest: requestPayloadDigest,
        exitPrice: shouldCloseTrade ? payload.automation.exitPrice : trade.automation?.exitPrice ?? null,
        exitTime: shouldCloseTrade
          ? payload.automation.exitTime || trade.automation?.exitTime || now
          : trade.automation?.exitTime || null,
        lastSyncAt: now,
      };

      trade = await trade.save();
    }

    if (hasMediaTasks) {
      await enqueueTradeMediaProcessing({
        tradeId: trade._id,
        source: "bridge",
        beforeTask: beforeMediaTask
          ? {
              ...beforeMediaTask,
              note: payload.screenshotNotes.before,
              autoCaptured: true,
            }
          : null,
        afterTask: afterMediaTask
          ? {
              ...afterMediaTask,
              note: payload.screenshotNotes.after,
              autoCaptured: true,
            }
          : null,
      });
    }

    user.integrations = user.integrations || {};
    user.integrations.mt5 = {
      ...(user.integrations.mt5 || {}),
      enabled: true,
      lastUsedAt: now,
      lastEventAt: now,
      lastEventType: eventType,
    };
    await user.save();

    if (bridgeEvent?._id) {
      await BridgeIngestEvent.updateOne(
        { _id: bridgeEvent._id },
        {
          $set: {
            status: "processed",
            processedAt: now,
            lastError: "",
            profileId: trade.profileId,
            externalTradeId: payload.automation.externalTradeId,
            eventType,
            payloadNormalized: {
              ...normalizedEventPayload,
              trade: {
                ...normalizedEventPayload.trade,
                result: trade.result,
                rrAchieved: trade.rrAchieved,
              },
              automation: {
                ...normalizedEventPayload.automation,
                status: trade.automation?.status || normalizedEventPayload.automation?.status,
                exitPrice: trade.automation?.exitPrice ?? null,
                exitTime: trade.automation?.exitTime || null,
              },
            },
            expiresAt: bridgeEventExpiresAt(),
          },
          $inc: {
            attempts: 1,
          },
        }
      );
    }

    await recordAudit({
      req,
      userId: user._id,
      action: "trade.bridge.synced",
      targetType: "trade",
      targetId: trade._id.toString(),
      metadata: {
        profileId: trade.profileId,
        bridge: trade.automation?.bridge || "mt5",
        eventType,
        externalTradeId: payload.automation.externalTradeId,
        created,
      },
    });

    scheduleDefaultAnalyticsSnapshotRebuild({
      user,
      profileId: trade.profileId,
    });

    res.status(created ? 201 : 200).json({
      ...transformTrade(trade, req),
      synced: true,
      created,
      eventType,
      guardrails,
      qualityFlags: trade.qualityFlags || [],
      strategyFingerprint: trade.strategyFingerprint || "",
      mediaProcessing: trade.mediaProcessing || {},
    });
  } catch (error) {
    if (bridgeEvent?._id) {
      try {
        await BridgeIngestEvent.updateOne(
          { _id: bridgeEvent._id },
          {
            $set: {
              status: "error",
              lastError: String(error.message || "Bridge sync failed.").slice(0, 400),
              expiresAt: bridgeEventExpiresAt(),
            },
            $inc: {
              attempts: 1,
            },
          }
        );
      } catch {
        // Ignore event update failures.
      }
    }

    if (error?.code === 11000) {
      try {
        const externalTradeId = ensureText(req.body?.externalTradeId || req.body?.trade?.externalTradeId);
        const resolved = bridgeContext || (await resolveBridgeUser(req));
        const user = resolved.user;
        const existing = await Trade.findOne({
          userId: user._id,
          "automation.externalTradeId": externalTradeId,
        });

        if (existing) {
          req.user = user;
          res.status(200).json({
            ...transformTrade(existing, req),
            idempotent: true,
            synced: true,
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
    const { limit = "200", page = "1", includeDetails = "false", includeTotal = "true" } = req.query;
    const filter = buildFilterFromRequest(req);
    const shouldIncludeDetails = toBoolean(includeDetails);
    const shouldIncludeTotal = toBoolean(includeTotal);

    const safeLimit = Math.min(Math.max(toNumber(limit, 200), 1), 500);
    const safePage = Math.max(toNumber(page, 1), 1);
    const skip = (safePage - 1) * safeLimit;

    const tradesQuery = Trade.find(filter).sort({ tradeDate: -1 }).skip(skip).limit(safeLimit);
    if (!shouldIncludeDetails) {
      tradesQuery.select(tradeListProjection);
    }

    let total = 0;
    let trades = [];
    if (shouldIncludeTotal) {
      [total, trades] = await Promise.all([Trade.countDocuments(filter), tradesQuery.lean()]);
    } else {
      trades = await tradesQuery.lean();
    }

    res.json({
      total: shouldIncludeTotal ? total : null,
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
        const derived = deriveTradeComputedState({
          payload,
          lifecycleEvent: "csv",
        });

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
          result: derived.result,
          plannedRR: payload.plannedRR,
          rrAchieved: derived.rrAchieved,
          strategyFingerprint: derived.strategyFingerprint,
          tags: payload.tags,
          notes: payload.notes,
          ruleBreakReason: payload.ruleBreakReason,
          guardrailWarnings: [],
          qualityFlags: derived.qualityFlags,
          screenshots: {
            before: ensureText(row.screenshotBefore),
            after: ensureText(row.screenshotAfter),
            beforeNote: ensureText(row.screenshotBeforeNote),
            afterNote: ensureText(row.screenshotAfterNote),
          },
          importSource: "csv",
          storageProvider: "imported",
          mediaProcessing: {
            status: "ready",
            pendingItems: [],
            lastError: "",
            updatedAt: new Date(),
          },
          automation: {
            source: "csv",
            status: "closed",
            eventType: "import",
            lastSyncAt: new Date(),
          },
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
