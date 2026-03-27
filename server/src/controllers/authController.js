import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { DEFAULT_RISK_CONTROLS, DEFAULT_STRATEGY_OPTIONS } from "../constants/defaults.js";
import { recordAudit } from "../services/audit.js";
import {
  ensureUserProfiles,
  findRefreshSession,
  hashToken,
  issueAuthTokens,
  revokeRefreshSession,
  rotateRefreshSession,
  signAccessToken,
  toPublicUser,
  verifyRefreshToken,
} from "../services/auth.js";

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

const slugify = (value = "") =>
  String(value || "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 40);

const uniqueProfileId = (user, name) => {
  const base = slugify(name) || "profile";
  let candidate = base;
  let index = 1;
  while ((user.profiles || []).some((profile) => profile.id === candidate)) {
    candidate = `${base}-${index}`;
    index += 1;
  }
  return candidate;
};

const unauthorized = (message = "Invalid session.") => {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
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
        riskPayload.requireRuleAlignment ??
        current.riskControls?.requireRuleAlignment ??
        DEFAULT_RISK_CONTROLS.requireRuleAlignment,
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
      strictChecklistGate:
        riskPayload.strictChecklistGate ??
        current.riskControls?.strictChecklistGate ??
        DEFAULT_RISK_CONTROLS.strictChecklistGate,
    },
  };
};

const respondWithAuth = async ({ req, res, user, statusCode = 200 }) => {
  ensureUserProfiles(user);
  const authPayload = issueAuthTokens(user, req);
  await user.save();

  res.status(statusCode).json({
    token: authPayload.token,
    refreshToken: authPayload.refreshToken,
    user: toPublicUser(user),
  });
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

    await recordAudit({
      req,
      userId: user._id,
      action: "auth.register",
      targetType: "user",
      targetId: user._id.toString(),
      metadata: { email: user.email },
    });

    await respondWithAuth({
      req,
      res,
      user,
      statusCode: 201,
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
      await recordAudit({
        req,
        action: "auth.login.failed",
        targetType: "email",
        targetId: email,
      });
      throw unauthorized("Invalid credentials.");
    }

    const isValid = await bcrypt.compare(password, user.passwordHash);
    if (!isValid) {
      await recordAudit({
        req,
        userId: user._id,
        action: "auth.login.failed",
        targetType: "user",
        targetId: user._id.toString(),
      });
      throw unauthorized("Invalid credentials.");
    }

    ensureUserProfiles(user);
    user.lastLoginAt = new Date();

    await recordAudit({
      req,
      userId: user._id,
      action: "auth.login.success",
      targetType: "user",
      targetId: user._id.toString(),
      metadata: { activeProfileId: user.activeProfileId },
    });

    await respondWithAuth({
      req,
      res,
      user,
      statusCode: 200,
    });
  } catch (error) {
    next(error);
  }
};

export const refreshSession = async (req, res, next) => {
  try {
    const refreshToken = String(req.body.refreshToken || "");
    if (!refreshToken) {
      throw unauthorized("Refresh token is required.");
    }

    const payload = verifyRefreshToken(refreshToken);
    if (payload.type !== "refresh" || !payload.sub || !payload.sid) {
      throw unauthorized("Invalid refresh token.");
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      throw unauthorized("Session not found.");
    }

    ensureUserProfiles(user);
    const session = findRefreshSession(user, payload.sid);
    if (!session) {
      throw unauthorized("Session revoked. Please log in again.");
    }

    if (session.tokenHash !== hashToken(refreshToken)) {
      throw unauthorized("Session mismatch. Please log in again.");
    }

    const expiresTs = new Date(session.expiresAt).getTime();
    if (!Number.isFinite(expiresTs) || expiresTs <= Date.now()) {
      revokeRefreshSession(user, payload.sid);
      await user.save();
      throw unauthorized("Session expired. Please log in again.");
    }

    const rotated = rotateRefreshSession(user, payload.sid, req);
    await user.save();

    await recordAudit({
      req,
      userId: user._id,
      action: "auth.refresh.success",
      targetType: "user",
      targetId: user._id.toString(),
      metadata: { activeProfileId: user.activeProfileId },
    });

    res.json({
      token: rotated.token,
      refreshToken: rotated.refreshToken,
      user: toPublicUser(user),
    });
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      next(unauthorized("Refresh session expired. Please log in again."));
      return;
    }
    next(error);
  }
};

export const logout = async (req, res, next) => {
  try {
    const refreshToken = String(req.body.refreshToken || "");
    const logoutAll = req.body.allSessions === true || req.body.allSessions === "true";

    if (!refreshToken && !logoutAll) {
      throw unauthorized("Refresh token is required for logout.");
    }

    if (logoutAll) {
      let targetUser = req.user || null;
      if (!targetUser && refreshToken) {
        try {
          const payload = verifyRefreshToken(refreshToken);
          targetUser = await User.findById(payload.sub);
        } catch {
          targetUser = null;
        }
      }

      if (!targetUser) {
        throw unauthorized("Authentication required.");
      }
      targetUser.refreshSessions = [];
      await targetUser.save();
      await recordAudit({
        req,
        userId: targetUser._id,
        action: "auth.logout.all",
        targetType: "user",
        targetId: targetUser._id.toString(),
      });
      res.json({ ok: true });
      return;
    }

    const payload = verifyRefreshToken(refreshToken);
    if (payload.type !== "refresh" || !payload.sub || !payload.sid) {
      throw unauthorized("Invalid refresh token.");
    }

    const user = await User.findById(payload.sub);
    if (!user) {
      throw unauthorized("Session not found.");
    }

    revokeRefreshSession(user, payload.sid);
    await user.save();

    await recordAudit({
      req,
      userId: user._id,
      action: "auth.logout",
      targetType: "user",
      targetId: user._id.toString(),
    });

    res.json({ ok: true });
  } catch (error) {
    if (error.name === "TokenExpiredError" || error.name === "JsonWebTokenError") {
      next(unauthorized("Session already expired."));
      return;
    }
    next(error);
  }
};

export const getMe = async (req, res) => {
  ensureUserProfiles(req.user);
  res.json({
    user: toPublicUser(req.user),
  });
};

export const updateSettings = async (req, res, next) => {
  try {
    const merged = mergeSettings(req.user.settings || {}, req.body || {});
    req.user.settings = merged;
    await req.user.save();

    await recordAudit({
      req,
      userId: req.user._id,
      action: "settings.updated",
      targetType: "user",
      targetId: req.user._id.toString(),
    });

    res.json({
      user: toPublicUser(req.user),
    });
  } catch (error) {
    next(error);
  }
};

export const createProfile = async (req, res, next) => {
  try {
    const name = normalizeName(req.body.name || "");
    const description = String(req.body.description || "").trim().slice(0, 200);

    if (name.length < 2) {
      const error = new Error("Profile name must be at least 2 characters.");
      error.statusCode = 400;
      throw error;
    }

    ensureUserProfiles(req.user);
    const nextId = uniqueProfileId(req.user, name);
    const profile = {
      id: nextId,
      name,
      description,
      isDefault: false,
      createdAt: new Date(),
    };

    req.user.profiles.push(profile);

    if (req.body.makeActive === true || req.body.makeActive === "true") {
      req.user.activeProfileId = nextId;
    }

    await req.user.save();

    await recordAudit({
      req,
      userId: req.user._id,
      action: "profile.created",
      targetType: "profile",
      targetId: nextId,
    });

    res.status(201).json({
      user: toPublicUser(req.user),
      profile,
    });
  } catch (error) {
    next(error);
  }
};

export const setActiveProfile = async (req, res, next) => {
  try {
    const profileId = String(req.body.profileId || "").trim();
    if (!profileId) {
      const error = new Error("profileId is required.");
      error.statusCode = 400;
      throw error;
    }

    ensureUserProfiles(req.user);
    const exists = (req.user.profiles || []).some((profile) => profile.id === profileId);
    if (!exists) {
      const error = new Error("Profile not found.");
      error.statusCode = 404;
      throw error;
    }

    req.user.activeProfileId = profileId;
    await req.user.save();

    await recordAudit({
      req,
      userId: req.user._id,
      action: "profile.activated",
      targetType: "profile",
      targetId: profileId,
    });

    res.json({
      token: signAccessToken(req.user),
      user: toPublicUser(req.user),
    });
  } catch (error) {
    next(error);
  }
};
