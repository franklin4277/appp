import { DEFAULT_STRATEGY_OPTIONS } from "../constants/defaults.js";

const toText = (value = "") =>
  String(value || "")
    .trim()
    .replace(/\u0000/g, "");

const toNumberValue = (value, fallback = Number.NaN) => {
  if (value === undefined || value === null) {
    return fallback;
  }
  const raw = String(value).trim();
  if (!raw) {
    return fallback;
  }
  const cleaned = raw.includes(",") && !raw.includes(".")
    ? raw.replace(/,/g, ".").replace(/\s+/g, "")
    : raw.replace(/,/g, "").replace(/\s+/g, "");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const sanitizeString = (value = "") =>
  toText(value)
    .replace(/[\u0001-\u001f\u007f]/g, "")
    .replace(/<\/?script\b[^>]*>/gi, "");

const isEmail = (value = "") => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(value || "").toLowerCase());
const isHttpUrl = (value = "") => /^https?:\/\//i.test(String(value || "").trim());
const PROHIBITED_OBJECT_KEYS = new Set(["__proto__", "prototype", "constructor"]);

const createValidationError = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const sanitizeValue = (value, depth = 0) => {
  if (depth > 18) {
    return undefined;
  }

  if (typeof value === "string") {
    return sanitizeString(value);
  }

  if (Array.isArray(value)) {
    return value.map((item) => sanitizeValue(item, depth + 1));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const output = {};
  Object.entries(value).forEach(([rawKey, rawValue]) => {
    const key = toText(rawKey);
    if (!key || PROHIBITED_OBJECT_KEYS.has(key) || key.startsWith("$") || key.includes(".")) {
      return;
    }
    output[key] = sanitizeValue(rawValue, depth + 1);
  });
  return output;
};

const sanitizeBodyStrings = (req, _res, next) => {
  if (!req.body || typeof req.body !== "object") {
    next();
    return;
  }

  req.body = sanitizeValue(req.body);
  next();
};

export const sanitizeInput = sanitizeBodyStrings;

export const validateRegisterPayload = (req, _res, next) => {
  const name = toText(req.body?.name);
  const email = toText(req.body?.email).toLowerCase();
  const password = toText(req.body?.password);

  if (name.length < 2 || name.length > 80) {
    next(createValidationError("Name must be between 2 and 80 characters."));
    return;
  }
  if (!isEmail(email)) {
    next(createValidationError("A valid email is required."));
    return;
  }
  if (password.length < 8) {
    next(createValidationError("Password must be at least 8 characters."));
    return;
  }

  req.body = { ...req.body, name, email, password };
  next();
};

export const validateLoginPayload = (req, _res, next) => {
  const email = toText(req.body?.email).toLowerCase();
  const password = toText(req.body?.password);
  if (!isEmail(email)) {
    next(createValidationError("A valid email is required."));
    return;
  }
  if (!password) {
    next(createValidationError("Password is required."));
    return;
  }
  req.body = { ...req.body, email, password };
  next();
};

export const validatePasswordResetRequestPayload = (req, _res, next) => {
  const email = toText(req.body?.email).toLowerCase();
  if (!isEmail(email)) {
    next(createValidationError("A valid email is required."));
    return;
  }
  req.body = { ...req.body, email };
  next();
};

export const validatePasswordResetConfirmPayload = (req, _res, next) => {
  const token = toText(req.body?.token);
  const newPassword = toText(req.body?.newPassword);
  if (token.length < 12) {
    next(createValidationError("Reset token is invalid."));
    return;
  }
  if (newPassword.length < 8) {
    next(createValidationError("New password must be at least 8 characters."));
    return;
  }
  req.body = { ...req.body, token, newPassword };
  next();
};

export const validateTradeCreatePayload = (req, _res, next) => {
  let pair = toText(req.body?.pair)
    .toUpperCase()
    .replace(/[^A-Z0-9]/g, "");
  const session = toText(req.body?.session);
  const tradeTypeRaw = toText(req.body?.tradeType).toLowerCase();
  const setupType = toText(req.body?.setupType);
  const result = toText(req.body?.result || "BE");

  const entry = toNumberValue(req.body?.entryPrice);
  const exitPriceRaw = req.body?.exitPrice;
  const exitPrice =
    exitPriceRaw === undefined || exitPriceRaw === null || exitPriceRaw === ""
      ? null
      : toNumberValue(exitPriceRaw);
  const exitTimeRaw = toText(req.body?.exitTime);
  const stop = toNumberValue(req.body?.stopLoss);
  const take = toNumberValue(req.body?.takeProfit);
  const riskPercent =
    req.body?.riskPercent === undefined || req.body?.riskPercent === null || req.body?.riskPercent === ""
      ? null
      : toNumberValue(req.body.riskPercent);

  if (!pair || pair.length < 3 || pair.length > 15) {
    const fallbackRaw =
      req.user?.settings?.options?.pairs?.[0] || DEFAULT_STRATEGY_OPTIONS.pairs?.[0] || "";
    const fallback = String(fallbackRaw || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "");
    if (fallback && fallback.length >= 3 && fallback.length <= 15) {
      pair = fallback;
    } else {
      next(createValidationError("pair is required and should be 3-15 characters."));
      return;
    }
  }

  if (!session || session.length > 40) {
    const fallbackRaw =
      req.user?.settings?.options?.sessions?.[0] || DEFAULT_STRATEGY_OPTIONS.sessions?.[0] || "";
    const fallback = toText(fallbackRaw);
    if (fallback && fallback.length <= 40) {
      req.body = { ...req.body, session: fallback };
    } else {
      next(createValidationError("session is required and should be under 40 characters."));
      return;
    }
  }

  if (!setupType || setupType.length > 80) {
    const fallbackRaw =
      req.user?.settings?.options?.setupTypes?.[0] || DEFAULT_STRATEGY_OPTIONS.setupTypes?.[0] || "";
    const fallback = toText(fallbackRaw);
    if (fallback && fallback.length <= 80) {
      req.body = { ...req.body, setupType: fallback };
    } else {
      next(createValidationError("setupType is required and should be under 80 characters."));
      return;
    }
  }

  if (!["buy", "sell"].includes(tradeTypeRaw)) {
    const fallbackRaw =
      req.user?.settings?.options?.tradeTypes?.[0] || DEFAULT_STRATEGY_OPTIONS.tradeTypes?.[0] || "Buy";
    const fallback = toText(fallbackRaw).toLowerCase();
    if (["buy", "sell"].includes(fallback)) {
      req.body = { ...req.body, tradeType: fallback === "buy" ? "Buy" : "Sell" };
    } else {
      next(createValidationError("tradeType must be Buy or Sell."));
      return;
    }
  }

  if (!Number.isFinite(entry) || entry <= 0) {
    next(
      createValidationError(
        `entryPrice is required and must be greater than 0. Received: "${toText(req.body?.entryPrice)}".`
      )
    );
    return;
  }
  if (!Number.isFinite(stop) || stop <= 0) {
    next(
      createValidationError(`stopLoss is required and must be greater than 0. Received: "${toText(req.body?.stopLoss)}".`)
    );
    return;
  }
  if (!Number.isFinite(take) || take <= 0) {
    next(
      createValidationError(
        `takeProfit is required and must be greater than 0. Received: "${toText(req.body?.takeProfit)}".`
      )
    );
    return;
  }
  if (exitPrice !== null && (!Number.isFinite(exitPrice) || exitPrice <= 0)) {
    next(createValidationError("exitPrice must be greater than 0 when provided."));
    return;
  }
  if (exitTimeRaw) {
    const parsedExitTime = new Date(exitTimeRaw).getTime();
    if (!Number.isFinite(parsedExitTime)) {
      next(createValidationError("exitTime must be a valid ISO date-time."));
      return;
    }
  }

  if (riskPercent !== null && (!Number.isFinite(riskPercent) || riskPercent < 0 || riskPercent > 100)) {
    next(createValidationError("riskPercent must be a number between 0 and 100."));
    return;
  }

  req.body = {
    ...req.body,
    pair,
    session,
    setupType,
    result,
    tradeType: tradeTypeRaw === "buy" ? "Buy" : "Sell",
    entryPrice: entry,
    ...(exitPrice !== null ? { exitPrice } : {}),
    ...(exitTimeRaw ? { exitTime: exitTimeRaw } : {}),
    stopLoss: stop,
    takeProfit: take,
    ...(riskPercent !== null ? { riskPercent } : {}),
  };
  next();
};

export const validateBillingCheckoutPayload = (req, _res, next) => {
  const planId = toText(req.body?.planId).toLowerCase();
  const successUrl = toText(req.body?.successUrl);
  const cancelUrl = toText(req.body?.cancelUrl);
  if (!planId) {
    next(createValidationError("planId is required."));
    return;
  }
  if (successUrl && !isHttpUrl(successUrl)) {
    next(createValidationError("successUrl must be an http(s) URL."));
    return;
  }
  if (cancelUrl && !isHttpUrl(cancelUrl)) {
    next(createValidationError("cancelUrl must be an http(s) URL."));
    return;
  }
  req.body = { ...req.body, planId, successUrl, cancelUrl };
  next();
};

export const validateBillingPortalPayload = (req, _res, next) => {
  const returnUrl = toText(req.body?.returnUrl);
  if (returnUrl && !isHttpUrl(returnUrl)) {
    next(createValidationError("returnUrl must be an http(s) URL."));
    return;
  }
  req.body = { ...req.body, returnUrl };
  next();
};

export const validateBillingMockPayload = (req, _res, next) => {
  const planId = toText(req.body?.planId).toLowerCase();
  const status = toText(req.body?.status || "active").toLowerCase();
  if (!planId) {
    next(createValidationError("planId is required."));
    return;
  }
  req.body = { ...req.body, planId, status };
  next();
};
