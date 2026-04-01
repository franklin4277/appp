import bcrypt from "bcryptjs";
import User from "../models/User.js";
import { DEFAULT_RISK_CONTROLS, DEFAULT_STRATEGY_OPTIONS } from "../constants/defaults.js";
import { recordAudit } from "../services/audit.js";
import {
  createOneTimeCode,
  createOneTimeToken,
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
import { sendAlert } from "../services/alerts.js";
import { getMailerDiagnostics, isMailerConfigured, sendEmail } from "../services/mailer.js";
import { trackFailedLoginAttempt } from "../services/security.js";

const normalizeEmail = (value = "") => String(value).trim().toLowerCase();
const normalizeName = (value = "") => String(value).trim();
const isProd = process.env.NODE_ENV === "production";

const asStringArray = (value = []) => {
  const source = Array.isArray(value) ? value : String(value).split(/[,\n]/g);
  return [...new Set(source.map((item) => String(item || "").trim()).filter(Boolean))].slice(0, 64);
};

const normalizePairList = (value = []) => {
  const normalized = (Array.isArray(value) ? value : [])
    .map((item) =>
      String(item || "")
        .toUpperCase()
        .replace(/[^A-Z0-9]/g, "")
    )
    .filter((item) => item.length >= 3 && item.length <= 15);

  if (normalized.length) {
    return normalized.slice(0, 64);
  }

  return DEFAULT_STRATEGY_OPTIONS.pairs;
};

const toNumber = (value, fallback) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const envDurationToMs = (value, fallbackMs) => {
  const source = String(value || "").trim();
  if (!source) {
    return fallbackMs;
  }

  if (/^\d+$/.test(source)) {
    return Math.max(Number(source) * 1000, 60_000);
  }

  const match = source.match(/^(\d+)\s*([smhd])$/i);
  if (!match) {
    return fallbackMs;
  }

  const amount = Number(match[1]);
  const unit = match[2].toLowerCase();
  const multipliers = {
    s: 1000,
    m: 60_000,
    h: 3_600_000,
    d: 86_400_000,
  };

  return Math.max(amount * (multipliers[unit] || 1000), 60_000);
};

const PASSWORD_RESET_TTL_MS = envDurationToMs(process.env.PASSWORD_RESET_EXPIRES_IN || "30m", 30 * 60_000);
const EMAIL_VERIFY_TTL_MS = envDurationToMs(process.env.EMAIL_VERIFY_EXPIRES_IN || "48h", 48 * 3_600_000);
const TWO_FACTOR_TTL_MS = envDurationToMs(process.env.TWO_FACTOR_EXPIRES_IN || "10m", 10 * 60_000);

const includeDebugSecrets = () => !isProd && process.env.ALLOW_DEBUG_AUTH_SECRETS !== "false";
const appLabel = "Journex";
const supportFooter = "If you did not request this, you can ignore this message.";
const antiPhishingNotice = "Security notice: never share codes or tokens. Support will never ask for them.";
const minutesLabel = (milliseconds) => Math.max(1, Math.round(milliseconds / 60_000));

const resolvePublicBaseUrl = () => {
  const explicit = String(process.env.PUBLIC_SHARE_BASE_URL || "").trim();
  const rawCandidates = explicit ? [explicit] : String(process.env.CLIENT_URL || "").split(",");
  const candidates = rawCandidates
    .map((item) => String(item || "").trim())
    .filter((item) => /^https?:\/\//i.test(item) && item !== "*" && !item.startsWith("*."));

  const isLocal = (origin) => /\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:|\/|$)/i.test(origin);
  const candidate = candidates.find((item) => !isLocal(item)) || candidates[0] || "";
  return candidate ? candidate.replace(/\/$/, "") : "";
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

const badRequest = (message) => {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
};

const sanitizeIntegrationLabel = (value = "") => {
  const label = String(value || "").trim().slice(0, 80);
  if (label.length >= 2) {
    return label;
  }
  return "MT5 Bridge";
};

const readMt5Integration = (user) => user?.integrations?.mt5 || {};

const toMt5IntegrationSummary = (user) => {
  const mt5 = readMt5Integration(user);
  return {
    enabled: Boolean(mt5.enabled),
    keyHint: String(mt5.keyHint || ""),
    label: String(mt5.label || "MT5 Bridge"),
    createdAt: mt5.createdAt || null,
    lastUsedAt: mt5.lastUsedAt || null,
    lastEventAt: mt5.lastEventAt || null,
    lastEventType: String(mt5.lastEventType || ""),
  };
};

const mergeSettings = (current = {}, next = {}) => {
  const optionsPayload = next.options || {};
  const riskPayload = next.riskControls || {};

  return {
    options: {
      pairs: normalizePairList(
        asStringArray(optionsPayload.pairs ?? current.options?.pairs ?? DEFAULT_STRATEGY_OPTIONS.pairs)
      ),
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

const clearTwoFactorChallenge = (user) => {
  user.twoFactor = {
    ...(user.twoFactor || {}),
    challengeId: "",
    challengeHash: "",
    challengeExpiresAt: null,
    challengeAttempts: 0,
  };
};

const createEmailVerificationForUser = (user) => {
  const token = createOneTimeToken(24);
  user.emailVerification = {
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + EMAIL_VERIFY_TTL_MS),
    requestedAt: new Date(),
    usedAt: null,
    verifiedAt: null,
  };
  return token;
};

const createPasswordResetForUser = (user) => {
  const token = createOneTimeToken(24);
  user.passwordReset = {
    tokenHash: hashToken(token),
    expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
    requestedAt: new Date(),
    usedAt: null,
    verifiedAt: null,
  };
  return token;
};

const sendTwoFactorCodeEmail = async ({ user, code }) => {
  const ttlMinutes = minutesLabel(TWO_FACTOR_TTL_MS);
  return sendEmail({
    to: user.email,
    subject: `${appLabel} login verification code`,
    text:
      `${appLabel} two-factor code: ${code}\n\n` +
      `This code expires in ${ttlMinutes} minutes.\n\n` +
      `${antiPhishingNotice}\n\n` +
      `${supportFooter}`,
    html:
      `<p>Your <strong>${appLabel}</strong> login verification code is:</p>` +
      `<h2 style="letter-spacing:2px;">${code}</h2>` +
      `<p>This code expires in ${ttlMinutes} minutes.</p>` +
      `<p><strong>${antiPhishingNotice}</strong></p>` +
      `<p>${supportFooter}</p>`,
  });
};

const queueTwoFactorCodeDispatch = ({ user, code }) => {
  void sendTwoFactorCodeEmail({ user, code })
    .then((delivery) => {
      dispatchSecurityMessage({
        event: "auth.2fa.challenge.delivery",
        message: delivery.sent ? "2FA code delivered by email." : "2FA code delivery failed.",
        details: {
          email: user?.email || "",
          mailSent: delivery.sent,
          mailError: delivery.sent ? "" : delivery.error,
          mailErrorCode: delivery.sent ? "" : delivery.errorCode,
          mailHint: delivery.sent ? "" : delivery.errorHint,
        },
      });
    })
    .catch((error) => {
      dispatchSecurityMessage({
        level: "error",
        event: "auth.2fa.challenge.delivery.failed",
        message: "2FA email dispatch crashed.",
        details: {
          email: user?.email || "",
          mailSent: false,
          mailError: String(error?.message || "Unknown dispatch error"),
          mailErrorCode: String(error?.code || "DISPATCH_FAILED"),
          mailHint: "Check SMTP connection and credentials.",
        },
      });
    });
};

const sendEmailVerificationTokenEmail = async ({ user, token }) => {
  const verifyUrlBase = resolvePublicBaseUrl();
  const verifyUrl = verifyUrlBase ? `${verifyUrlBase}/verify-email?token=${encodeURIComponent(token)}` : "";
  return sendEmail({
    to: user.email,
    subject: `${appLabel} email verification`,
    text:
      `${appLabel} email verification token:\n${token}\n\n` +
      (verifyUrl ? `Verification link: ${verifyUrl}\n\n` : "") +
      `${antiPhishingNotice}\n\n` +
      `${supportFooter}`,
    html:
      `<p>Use this verification token:</p><p><strong>${token}</strong></p>` +
      (verifyUrl ? `<p>Verification link: <a href="${verifyUrl}">${verifyUrl}</a></p>` : "") +
      `<p><strong>${antiPhishingNotice}</strong></p>` +
      `<p>${supportFooter}</p>`,
  });
};

const queueEmailVerificationDispatch = ({ user, token, reason = "verification.requested" }) => {
  const email = user?.email || "";
  const expiresAt = user?.emailVerification?.expiresAt?.toISOString?.() || null;

  void sendEmailVerificationTokenEmail({ user, token })
    .then((delivery) => {
      dispatchSecurityMessage({
        event: "auth.email.verification.requested",
        message: "Email verification token generated.",
        details: {
          reason,
          email,
          expiresAt,
          mailSent: delivery.sent,
          mailError: delivery.sent ? "" : delivery.error,
          mailErrorCode: delivery.sent ? "" : delivery.errorCode,
          mailHint: delivery.sent ? "" : delivery.errorHint,
          debugToken: includeDebugSecrets() ? token : undefined,
        },
      });
    })
    .catch((error) => {
      dispatchSecurityMessage({
        level: "error",
        event: "auth.email.verification.dispatch.failed",
        message: "Failed to dispatch email verification message.",
        details: {
          reason,
          email,
          expiresAt,
          mailSent: false,
          mailError: String(error?.message || "Unknown dispatch error"),
          mailErrorCode: String(error?.code || "DISPATCH_FAILED"),
          mailHint: "Check SMTP connection and credentials.",
          debugToken: includeDebugSecrets() ? token : undefined,
        },
      });
    });
};

const sendPasswordResetTokenEmail = async ({ user, token }) => {
  const resetUrlBase = resolvePublicBaseUrl();
  const resetUrl = resetUrlBase ? `${resetUrlBase}/reset-password?token=${encodeURIComponent(token)}` : "";
  const ttlMinutes = minutesLabel(PASSWORD_RESET_TTL_MS);
  return sendEmail({
    to: user.email,
    subject: `${appLabel} password reset`,
    text:
      `${appLabel} password reset token:\n${token}\n\n` +
      (resetUrl ? `Reset link: ${resetUrl}\n\n` : "") +
      `This token expires in ${ttlMinutes} minutes.\n\n` +
      `${antiPhishingNotice}\n\n` +
      `${supportFooter}`,
    html:
      `<p>Use this password reset token:</p><p><strong>${token}</strong></p>` +
      (resetUrl ? `<p>Reset link: <a href="${resetUrl}">${resetUrl}</a></p>` : "") +
      `<p>This token expires in ${ttlMinutes} minutes.</p>` +
      `<p><strong>${antiPhishingNotice}</strong></p>` +
      `<p>${supportFooter}</p>`,
  });
};

const dispatchSecurityMessage = ({ level = "info", event, message, details = {} }) => {
  sendAlert({
    level,
    event,
    message,
    details,
    source: "auth",
  });
};

const respondWithAuth = async ({ req, res, user, statusCode = 200, extras = {} }) => {
  ensureUserProfiles(user);
  const authPayload = issueAuthTokens(user, req);
  await user.save();

  res.status(statusCode).json({
    token: authPayload.token,
    refreshToken: authPayload.refreshToken,
    user: toPublicUser(user),
    ...extras,
  });
};

export const register = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const name = normalizeName(req.body.name || "Trader");
    const password = String(req.body.password || "");

    if (!email || !password) {
      throw badRequest("Email and password are required.");
    }

    if (password.length < 8) {
      throw badRequest("Password must be at least 8 characters.");
    }

    const existing = await User.findOne({ email });
    if (existing) {
      const conflict = new Error("An account with this email already exists.");
      conflict.statusCode = 409;
      throw conflict;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await User.create({
      email,
      name,
      passwordHash,
      settings: mergeSettings(),
      emailVerified: false,
    });

    const verificationToken = createEmailVerificationForUser(user);
    await user.save();

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
      extras: includeDebugSecrets()
        ? {
            debug: {
              emailVerificationToken: verificationToken,
            },
            delivery: {
              queued: true,
              configured: isMailerConfigured(),
            },
          }
        : {
            delivery: {
              queued: true,
              configured: isMailerConfigured(),
            },
          },
    });

    queueEmailVerificationDispatch({
      user,
      token: verificationToken,
      reason: "register",
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
      throw badRequest("Email and password are required.");
    }

    const user = await User.findOne({ email });
    if (!user) {
      trackFailedLoginAttempt({ req, email });
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
      trackFailedLoginAttempt({ req, email });
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

    if (user.twoFactor?.enabled) {
      const mailerConfigured = isMailerConfigured();
      if (!mailerConfigured && !includeDebugSecrets()) {
        const unavailable = new Error(
          "2FA email delivery is unavailable. Configure SMTP settings or disable 2FA temporarily."
        );
        unavailable.statusCode = 503;
        throw unavailable;
      }

      const challengeId = createOneTimeToken(12);
      const code = createOneTimeCode(6);

      user.twoFactor = {
        ...(user.twoFactor || {}),
        enabled: true,
        method: "email_code",
        challengeId,
        challengeHash: hashToken(code),
        challengeExpiresAt: new Date(Date.now() + TWO_FACTOR_TTL_MS),
        challengeAttempts: 0,
        lastChallengeAt: new Date(),
      };

      await user.save();

      await recordAudit({
        req,
        userId: user._id,
        action: "auth.login.2fa.challenge",
        targetType: "user",
        targetId: user._id.toString(),
      });

      dispatchSecurityMessage({
        event: "auth.2fa.challenge.issued",
        message: "2FA challenge issued for login.",
        details: {
          email: user.email,
          expiresAt: user.twoFactor.challengeExpiresAt?.toISOString?.() || null,
          mailSent: mailerConfigured,
          mailError: "",
          mailErrorCode: "",
          mailHint: "",
          debugCode: includeDebugSecrets() ? code : undefined,
        },
      });

      res.status(202).json({
        requiresTwoFactor: true,
        challengeId,
        message: mailerConfigured
          ? "Two-factor verification code is being sent to your email."
          : "Two-factor verification code generated (debug mode).",
        delivery: mailerConfigured ? "queued" : "debug",
        ...(includeDebugSecrets() ? { debugCode: code } : {}),
      });

      if (mailerConfigured) {
        queueTwoFactorCodeDispatch({ user, code });
      }
      return;
    }

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

export const verifyTwoFactorLogin = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    const challengeId = String(req.body.challengeId || "").trim();
    const code = String(req.body.code || "").trim();

    if (!email || !challengeId || !code) {
      throw badRequest("email, challengeId and code are required.");
    }

    const user = await User.findOne({ email });
    if (!user || !user.twoFactor?.enabled) {
      throw unauthorized("2FA verification failed.");
    }

    const challengeMatches = user.twoFactor.challengeId === challengeId && user.twoFactor.challengeHash;
    if (!challengeMatches) {
      throw unauthorized("2FA challenge is invalid.");
    }

    const expiresAt = user.twoFactor.challengeExpiresAt ? new Date(user.twoFactor.challengeExpiresAt).getTime() : 0;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      clearTwoFactorChallenge(user);
      await user.save();
      throw unauthorized("2FA challenge expired. Please log in again.");
    }

    const attempts = Number(user.twoFactor.challengeAttempts || 0);
    if (attempts >= 5) {
      clearTwoFactorChallenge(user);
      await user.save();
      throw unauthorized("Too many invalid 2FA attempts. Please log in again.");
    }

    if (hashToken(code) !== user.twoFactor.challengeHash) {
      user.twoFactor.challengeAttempts = attempts + 1;
      await user.save();
      trackFailedLoginAttempt({ req, email });
      throw unauthorized("Invalid 2FA code.");
    }

    clearTwoFactorChallenge(user);
    ensureUserProfiles(user);
    user.lastLoginAt = new Date();

    await recordAudit({
      req,
      userId: user._id,
      action: "auth.login.2fa.success",
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

export const requestPasswordReset = async (req, res, next) => {
  try {
    const email = normalizeEmail(req.body.email);
    if (!email) {
      throw badRequest("Email is required.");
    }

    const user = await User.findOne({ email });
    let debugToken = "";
    let mailSent = false;
    let mailError = "";
    let mailErrorCode = "";
    let mailHint = "";

    if (user) {
      const resetToken = createPasswordResetForUser(user);
      clearTwoFactorChallenge(user);
      await user.save();
      debugToken = resetToken;
      const resetMail = await sendPasswordResetTokenEmail({
        user,
        token: resetToken,
      });
      mailSent = resetMail.sent;
      mailError = resetMail.error || "";
      mailErrorCode = resetMail.errorCode || "";
      mailHint = resetMail.errorHint || "";

      await recordAudit({
        req,
        userId: user._id,
        action: "auth.password.reset.request",
        targetType: "user",
        targetId: user._id.toString(),
      });

      dispatchSecurityMessage({
        event: "auth.password.reset.requested",
        message: "Password reset token generated.",
        details: {
          email,
          expiresAt: user.passwordReset?.expiresAt?.toISOString?.() || null,
          mailSent,
          mailError,
          mailErrorCode: resetMail.errorCode || "",
          mailHint: resetMail.errorHint || "",
          debugToken: includeDebugSecrets() ? resetToken : undefined,
        },
      });
    }

    res.json({
      ok: true,
      message: user
        ? mailSent
          ? "Password reset instructions sent to email."
          : "Password reset token generated but email delivery failed."
        : "If the account exists, reset instructions were generated.",
      ...(user
        ? {
            delivery: {
              sent: mailSent,
              configured: isMailerConfigured(),
              error: mailSent ? "" : mailError,
              errorCode: mailSent ? "" : mailErrorCode,
              hint: mailSent ? "" : mailHint,
            },
          }
        : {}),
      ...(includeDebugSecrets() && debugToken
        ? {
            debugToken,
          }
        : {}),
    });
  } catch (error) {
    next(error);
  }
};

export const confirmPasswordReset = async (req, res, next) => {
  try {
    const token = String(req.body.token || "").trim();
    const newPassword = String(req.body.newPassword || "");

    if (!token || !newPassword) {
      throw badRequest("token and newPassword are required.");
    }

    if (newPassword.length < 8) {
      throw badRequest("Password must be at least 8 characters.");
    }

    const user = await User.findOne({
      "passwordReset.tokenHash": hashToken(token),
    });

    if (!user) {
      throw badRequest("Password reset token is invalid.");
    }

    const expiresAt = user.passwordReset?.expiresAt ? new Date(user.passwordReset.expiresAt).getTime() : 0;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw badRequest("Password reset token has expired.");
    }

    user.passwordHash = await bcrypt.hash(newPassword, 12);
    user.refreshSessions = [];
    user.passwordReset = {
      tokenHash: "",
      expiresAt: null,
      requestedAt: user.passwordReset?.requestedAt || null,
      usedAt: new Date(),
      verifiedAt: null,
    };
    clearTwoFactorChallenge(user);
    await user.save();

    await recordAudit({
      req,
      userId: user._id,
      action: "auth.password.reset.confirmed",
      targetType: "user",
      targetId: user._id.toString(),
    });

    res.json({
      ok: true,
      message: "Password was reset. Please log in again.",
    });
  } catch (error) {
    next(error);
  }
};

export const requestEmailVerification = async (req, res, next) => {
  try {
    const user = req.user;
    if (user.emailVerified) {
      res.json({
        ok: true,
        message: "Email is already verified.",
      });
      return;
    }

    const verificationToken = createEmailVerificationForUser(user);
    await user.save();

    await recordAudit({
      req,
      userId: user._id,
      action: "auth.email.verification.request",
      targetType: "user",
      targetId: user._id.toString(),
    });

    queueEmailVerificationDispatch({
      user,
      token: verificationToken,
      reason: "manual-request",
    });

    const mailerConfigured = isMailerConfigured();

    res.json({
      ok: true,
      message: mailerConfigured
        ? "Verification token generated. Email dispatch started."
        : "Verification token generated. SMTP is not configured, so use token manually.",
      delivery: {
        sent: false,
        queued: mailerConfigured,
        configured: mailerConfigured,
        error: mailerConfigured ? "" : "SMTP mailer is not configured.",
        errorCode: mailerConfigured ? "" : "SMTP_NOT_CONFIGURED",
        hint: mailerConfigured ? "Delivery runs in the background." : "Set SMTP_HOST/PORT (or SMTP_URL) and EMAIL_FROM.",
      },
      fallbackToken: verificationToken,
      ...(includeDebugSecrets()
        ? {
            debugToken: verificationToken,
          }
        : {}),
    });
  } catch (error) {
    next(error);
  }
};

export const getEmailDeliveryStatus = async (_req, res, next) => {
  try {
    res.json({
      ok: true,
      mailer: getMailerDiagnostics(),
    });
  } catch (error) {
    next(error);
  }
};

export const sendEmailDeliveryTest = async (req, res, next) => {
  try {
    const recipient = normalizeEmail(req.body.email || req.user?.email || "");
    if (!recipient) {
      throw badRequest("Recipient email is required.");
    }

    const delivery = await sendEmail({
      to: recipient,
      subject: `${appLabel} SMTP delivery test`,
      text:
        `This is a test email from ${appLabel}.\n\n` +
        `If this arrives, SMTP delivery is working correctly.\n\n` +
        `${supportFooter}`,
      html:
        `<p>This is a test email from <strong>${appLabel}</strong>.</p>` +
        `<p>If this arrives, SMTP delivery is working correctly.</p>` +
        `<p>${supportFooter}</p>`,
    });

    await recordAudit({
      req,
      userId: req.user?._id,
      action: "auth.email.delivery.test",
      targetType: "email",
      targetId: recipient,
      metadata: {
        sent: delivery.sent,
        errorCode: delivery.errorCode || "",
      },
    });

    res.json({
      ok: delivery.sent,
      recipient,
      delivery: {
        sent: delivery.sent,
        error: delivery.error || "",
        errorCode: delivery.errorCode || "",
        hint: delivery.errorHint || "",
      },
      mailer: getMailerDiagnostics(),
    });
  } catch (error) {
    next(error);
  }
};

export const verifyEmail = async (req, res, next) => {
  try {
    const token = String(req.body.token || req.query.token || "").trim();
    if (!token) {
      throw badRequest("Verification token is required.");
    }

    const user = await User.findOne({
      "emailVerification.tokenHash": hashToken(token),
    });

    if (!user) {
      throw badRequest("Verification token is invalid.");
    }

    const expiresAt = user.emailVerification?.expiresAt ? new Date(user.emailVerification.expiresAt).getTime() : 0;
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
      throw badRequest("Verification token expired.");
    }

    user.emailVerified = true;
    user.emailVerification = {
      tokenHash: "",
      expiresAt: null,
      requestedAt: user.emailVerification?.requestedAt || null,
      usedAt: new Date(),
      verifiedAt: new Date(),
    };
    await user.save();

    await recordAudit({
      req,
      userId: user._id,
      action: "auth.email.verified",
      targetType: "user",
      targetId: user._id.toString(),
    });

    res.json({
      ok: true,
      message: "Email verified successfully.",
    });
  } catch (error) {
    next(error);
  }
};

export const enableTwoFactor = async (req, res, next) => {
  try {
    if (!isMailerConfigured() && !includeDebugSecrets()) {
      const error = new Error(
        "Cannot enable 2FA: SMTP email is not configured. Add SMTP settings first."
      );
      error.statusCode = 400;
      throw error;
    }

    const password = String(req.body.password || "");
    if (!password) {
      throw badRequest("Password confirmation is required.");
    }

    const isValid = await bcrypt.compare(password, req.user.passwordHash);
    if (!isValid) {
      throw unauthorized("Password confirmation failed.");
    }

    req.user.twoFactor = {
      ...(req.user.twoFactor || {}),
      enabled: true,
      method: "email_code",
      challengeId: "",
      challengeHash: "",
      challengeExpiresAt: null,
      challengeAttempts: 0,
    };
    await req.user.save();

    await recordAudit({
      req,
      userId: req.user._id,
      action: "auth.2fa.enabled",
      targetType: "user",
      targetId: req.user._id.toString(),
    });

    res.json({
      ok: true,
      user: toPublicUser(req.user),
      message: "Two-factor login enabled.",
    });
  } catch (error) {
    next(error);
  }
};

export const disableTwoFactor = async (req, res, next) => {
  try {
    const password = String(req.body.password || "");
    if (!password) {
      throw badRequest("Password confirmation is required.");
    }

    const isValid = await bcrypt.compare(password, req.user.passwordHash);
    if (!isValid) {
      throw unauthorized("Password confirmation failed.");
    }

    req.user.twoFactor = {
      ...(req.user.twoFactor || {}),
      enabled: false,
      method: "email_code",
      challengeId: "",
      challengeHash: "",
      challengeExpiresAt: null,
      challengeAttempts: 0,
    };
    await req.user.save();

    await recordAudit({
      req,
      userId: req.user._id,
      action: "auth.2fa.disabled",
      targetType: "user",
      targetId: req.user._id.toString(),
    });

    res.json({
      ok: true,
      user: toPublicUser(req.user),
      message: "Two-factor login disabled.",
    });
  } catch (error) {
    next(error);
  }
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

export const generateMt5IntegrationKey = async (req, res, next) => {
  try {
    const label = sanitizeIntegrationLabel(req.body?.label);
    const previous = readMt5Integration(req.user);
    const apiKey = `tj_mt5_${createOneTimeToken(24)}`;
    const now = new Date();

    req.user.integrations = {
      ...(req.user.integrations || {}),
      mt5: {
        ...previous,
        enabled: true,
        label,
        keyHash: hashToken(apiKey),
        keyHint: apiKey.slice(-8),
        createdAt: now,
      },
    };

    await req.user.save();

    await recordAudit({
      req,
      userId: req.user._id,
      action: "integration.mt5.key.rotated",
      targetType: "integration",
      targetId: "mt5",
      metadata: {
        label,
      },
    });

    res.status(201).json({
      ok: true,
      apiKey,
      integration: toMt5IntegrationSummary(req.user),
      user: toPublicUser(req.user),
      warning: "Store this API key securely. It is shown once.",
    });
  } catch (error) {
    next(error);
  }
};

export const disableMt5Integration = async (req, res, next) => {
  try {
    const previous = readMt5Integration(req.user);
    req.user.integrations = {
      ...(req.user.integrations || {}),
      mt5: {
        ...previous,
        enabled: false,
        keyHash: "",
        keyHint: "",
      },
    };

    await req.user.save();

    await recordAudit({
      req,
      userId: req.user._id,
      action: "integration.mt5.disabled",
      targetType: "integration",
      targetId: "mt5",
    });

    res.json({
      ok: true,
      integration: toMt5IntegrationSummary(req.user),
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
      throw badRequest("Profile name must be at least 2 characters.");
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
      throw badRequest("profileId is required.");
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
