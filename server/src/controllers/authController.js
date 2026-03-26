import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { DEFAULT_RISK_CONTROLS, DEFAULT_STRATEGY_OPTIONS } from "../constants/defaults.js";
import { signAuthToken, toPublicUser } from "../services/auth.js";

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();
const normalizeName = (value = "") => String(value).trim();

const asStringArray = (value = []) => {
  const source = Array.isArray(value) ? value : String(value).split(/[,\n]/g);
  return [...new Set(source.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 64);
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const mergeSettings = (current = {}, next = {}) => {
  const optionsPayload = next.options || {};
  const riskPayload = next.riskControls || {};

  return {
    options: {
      pairs: asStringArray(optionsPayload.pairs ?? current.options?.pairs ?? DEFAULT_STRATEGY_OPTIONS.pairs),
      sessions: asStringArray(
        optionsPayload.sessions ?? current.options?.sessions ?? DEFAULT_STRATEGY_OPTIONS.sessions
      ),
      setupTypes: asStringArray(
        optionsPayload.setupTypes ?? current.options?.setupTypes ?? DEFAULT_STRATEGY_OPTIONS.setupTypes
      ),
      tradeTypes: asStringArray(
        optionsPayload.tradeTypes ?? current.options?.tradeTypes ?? DEFAULT_STRATEGY_OPTIONS.tradeTypes
      ),
      results: asStringArray(optionsPayload.results ?? current.options?.results ?? DEFAULT_STRATEGY_OPTIONS.results),
      pocOutcomes: asStringArray(
        optionsPayload.pocOutcomes ?? current.options?.pocOutcomes ?? DEFAULT_STRATEGY_OPTIONS.pocOutcomes
      ),
      emotionTags: asStringArray(
        optionsPayload.emotionTags ?? current.options?.emotionTags ?? DEFAULT_STRATEGY_OPTIONS.emotionTags
      ),
    },
    riskControls: {
      requireRuleAlignment:
        riskPayload.requireRuleAlignment ?? current.riskControls?.requireRuleAlignment ?? DEFAULT_RISK_CONTROLS.requireRuleAlignment,
      maxTradesPerSession: Math.max(
        0,
        toNumber(riskPayload.maxTradesPerSession, current.riskControls?.maxTradesPerSession) ??
          DEFAULT_RISK_CONTROLS.maxTradesPerSession
      ),
      cooldownMinutesAfterLoss: Math.max(
        0,
        toNumber(riskPayload.cooldownMinutesAfterLoss, current.riskControls?.cooldownMinutesAfterLoss) ??
          DEFAULT_RISK_CONTROLS.cooldownMinutesAfterLoss
      ),
      stopForDayLossRR: Math.max(
        0,
        toNumber(riskPayload.stopForDayLossRR, current.riskControls?.stopForDayLossRR) ??
          DEFAULT_RISK_CONTROLS.stopForDayLossRR
      ),
    },
  };
};

export const register = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const name = normalizeName(req.body.name || "Trader");
    const password = String(req.body.password || "");

    if (!email || !password) {
      const error = new Error("Email and password are required.");
      error.statusCode = 400;
      throw error;
    }

    if (password.length < 8) {
      const error = new Error("Password must be at least 8 characters.");
      error.statusCode = 400;
      throw error;
    }

    const existing = await User.findOne({ email });
    if (existing) {
      const error = new Error("An account with this email already exists.");
      error.statusCode = 409;
      throw error;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email,
      name,
      passwordHash,
      settings: mergeSettings(),
    });

    res.status(201).json({
      token: signAuthToken(user),
      user: toPublicUser(user),
    });
  } catch (error) {
    next(error);
  }
};

export const login = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const password = String(req.body.password || "");

    if (!email || !password) {
      const error = new Error("Email and password are required.");
      error.statusCode = 400;
      throw error;
    }

    const user = await User.findOne({ email });
    if (!user) {
      const error = new Error("Invalid credentials.");
      error.statusCode = 401;
      throw error;
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      const error = new Error("Invalid credentials.");
      error.statusCode = 401;
      throw error;
    }

    user.lastLoginAt = new Date();
    await user.save();

    res.json({
      token: signAuthToken(user),
      user: toPublicUser(user),
    });
  } catch (error) {
    next(error);
  }
};

export const getMe = async (req, res) => {
  res.json({
    user: toPublicUser(req.user),
  });
};

export const updateSettings = async (req, res, next) => {
  try {
    const merged = mergeSettings(req.user.settings || {}, req.body || {});
    req.user.settings = merged;
    await req.user.save();

    res.json({
      user: toPublicUser(req.user),
    });
  } catch (error) {
    next(error);
  }
};

