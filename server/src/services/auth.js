import crypto from "crypto";
import jwt from "jsonwebtoken";

const DEV_SECRET = "local-dev-only-change-me";
const DEFAULT_ACCESS_EXPIRES_IN = "20m";
const DEFAULT_REFRESH_EXPIRES_IN = "30d";
const DEFAULT_PROFILE_ID = "main";
const MAX_REFRESH_SESSIONS = 6;

const toString = (value = "") => String(value || "").trim();

const resolveSecret = ({ envKey, fallback = "" }) => {
  const value = toString(process.env[envKey]);
  if (value) {
    return value;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error(`${envKey} is required in production.`);
  }

  return fallback || DEV_SECRET;
};

const resolveAccessSecret = () => resolveSecret({ envKey: "JWT_SECRET", fallback: DEV_SECRET });

const resolveRefreshSecret = () =>
  resolveSecret({
    envKey: "JWT_REFRESH_SECRET",
    fallback: `${resolveAccessSecret()}::refresh`,
  });

const parseExpiryToMs = (value, fallbackMs) => {
  const source = toString(value);
  if (!source) {
    return fallbackMs;
  }

  if (/^\d+$/.test(source)) {
    return Math.max(Number(source) * 1000, 60_000);
  }

  const match = source.match(/^(\d+)\s*([smhdw])$/i);
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
    w: 604_800_000,
  };

  return Math.max(amount * (multipliers[unit] || 1000), 60_000);
};

const refreshLifetimeMs = () =>
  parseExpiryToMs(process.env.JWT_REFRESH_EXPIRES_IN || DEFAULT_REFRESH_EXPIRES_IN, 30 * 86_400_000);

export const accessTokenExpiresIn = () => process.env.JWT_EXPIRES_IN || DEFAULT_ACCESS_EXPIRES_IN;
export const refreshTokenExpiresIn = () => process.env.JWT_REFRESH_EXPIRES_IN || DEFAULT_REFRESH_EXPIRES_IN;

export const hashToken = (value = "") => crypto.createHash("sha256").update(String(value)).digest("hex");

export const createSessionId = () => crypto.randomBytes(24).toString("hex");

export const ensureUserProfiles = (user) => {
  if (!Array.isArray(user?.profiles) || !user.profiles.length) {
    user.profiles = [
      {
        id: DEFAULT_PROFILE_ID,
        name: "Main Profile",
        description: "Default journal profile",
        isDefault: true,
        createdAt: new Date(),
      },
    ];
  }

  if (!user.profiles.some((profile) => profile.isDefault)) {
    user.profiles[0].isDefault = true;
  }

  if (!user.activeProfileId || !user.profiles.some((profile) => profile.id === user.activeProfileId)) {
    const fallback = user.profiles.find((profile) => profile.isDefault) || user.profiles[0];
    user.activeProfileId = fallback.id;
  }

  return user;
};

export const resolveActiveProfileId = (user) => {
  ensureUserProfiles(user);
  return user.activeProfileId || DEFAULT_PROFILE_ID;
};

export const resolveDefaultProfileId = (user) => {
  ensureUserProfiles(user);
  return (user.profiles.find((profile) => profile.isDefault) || user.profiles[0])?.id || DEFAULT_PROFILE_ID;
};

export const signAccessToken = (user) =>
  jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      name: user.name,
      profileId: resolveActiveProfileId(user),
      type: "access",
    },
    resolveAccessSecret(),
    {
      expiresIn: accessTokenExpiresIn(),
    }
  );

export const signRefreshToken = ({ userId, sessionId }) =>
  jwt.sign(
    {
      sub: String(userId),
      sid: String(sessionId),
      type: "refresh",
    },
    resolveRefreshSecret(),
    {
      expiresIn: refreshTokenExpiresIn(),
    }
  );

export const verifyAccessToken = (token) => jwt.verify(token, resolveAccessSecret());
export const verifyRefreshToken = (token) => jwt.verify(token, resolveRefreshSecret());

export const signAuthToken = signAccessToken;
export const verifyAuthToken = verifyAccessToken;

const cleanupRefreshSessions = (user) => {
  const nowTs = Date.now();
  user.refreshSessions = (user.refreshSessions || []).filter((session) => {
    const ts = new Date(session.expiresAt).getTime();
    return Number.isFinite(ts) && ts > nowTs;
  });

  if (user.refreshSessions.length > MAX_REFRESH_SESSIONS) {
    user.refreshSessions = [...user.refreshSessions]
      .sort((a, b) => new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime())
      .slice(0, MAX_REFRESH_SESSIONS);
  }
};

const requestIp = (req) =>
  String(
    req?.headers?.["x-forwarded-for"]?.split?.(",")?.[0]?.trim?.() ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      ""
  ).slice(0, 80);

const requestUa = (req) => String(req?.headers?.["user-agent"] || "").slice(0, 300);

export const attachRefreshSession = (user, refreshToken, sessionId, req) => {
  cleanupRefreshSessions(user);

  user.refreshSessions = [
    {
      sessionId,
      tokenHash: hashToken(refreshToken),
      expiresAt: new Date(Date.now() + refreshLifetimeMs()),
      userAgent: requestUa(req),
      ip: requestIp(req),
      lastUsedAt: new Date(),
      createdAt: new Date(),
    },
    ...(user.refreshSessions || []),
  ].slice(0, MAX_REFRESH_SESSIONS);
};

export const revokeRefreshSession = (user, sessionId) => {
  const before = (user.refreshSessions || []).length;
  user.refreshSessions = (user.refreshSessions || []).filter((session) => session.sessionId !== sessionId);
  return before !== user.refreshSessions.length;
};

export const issueAuthTokens = (user, req) => {
  ensureUserProfiles(user);
  const sessionId = createSessionId();
  const refreshToken = signRefreshToken({ userId: user._id, sessionId });
  attachRefreshSession(user, refreshToken, sessionId, req);
  const token = signAccessToken(user);
  return {
    token,
    refreshToken,
    sessionId,
  };
};

export const rotateRefreshSession = (user, previousSessionId, req) => {
  revokeRefreshSession(user, previousSessionId);
  return issueAuthTokens(user, req);
};

export const findRefreshSession = (user, sessionId) =>
  (user.refreshSessions || []).find((session) => session.sessionId === sessionId);

export const toPublicUser = (user) => {
  ensureUserProfiles(user);
  return {
    id: user._id?.toString?.() || user.id,
    name: user.name,
    email: user.email,
    settings: user.settings,
    profiles: user.profiles || [],
    activeProfileId: user.activeProfileId || DEFAULT_PROFILE_ID,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
};
