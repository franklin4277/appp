import assert from "node:assert/strict";
import test from "node:test";
import {
  ensureUserProfiles,
  issueAuthTokens,
  rotateRefreshSession,
  toPublicUser,
  verifyAccessToken,
  verifyRefreshToken,
} from "../src/services/auth.js";

process.env.JWT_SECRET = process.env.JWT_SECRET || "test-access-secret";
process.env.JWT_REFRESH_SECRET = process.env.JWT_REFRESH_SECRET || "test-refresh-secret";

const createMockUser = () => ({
  _id: {
    toString: () => "507f1f77bcf86cd799439011",
  },
  email: "trader@example.com",
  name: "Trader",
  settings: {},
  profiles: [],
  activeProfileId: "",
  refreshSessions: [],
  emailVerified: false,
  twoFactor: { enabled: false },
});

test("issueAuthTokens sets refresh session and creates valid JWTs", () => {
  const user = createMockUser();
  ensureUserProfiles(user);

  const auth = issueAuthTokens(user, {
    headers: {
      "user-agent": "node-test",
    },
    ip: "127.0.0.1",
  });

  assert.ok(auth.token);
  assert.ok(auth.refreshToken);
  assert.ok(auth.sessionId);
  assert.equal(user.refreshSessions.length, 1);

  const accessPayload = verifyAccessToken(auth.token);
  const refreshPayload = verifyRefreshToken(auth.refreshToken);
  assert.equal(accessPayload.sub, "507f1f77bcf86cd799439011");
  assert.equal(accessPayload.type, "access");
  assert.equal(refreshPayload.type, "refresh");
  assert.equal(refreshPayload.sid, auth.sessionId);
});

test("rotateRefreshSession replaces old session with new token session", () => {
  const user = createMockUser();
  ensureUserProfiles(user);

  const initial = issueAuthTokens(user, {});
  const next = rotateRefreshSession(user, initial.sessionId, {});

  assert.equal(user.refreshSessions.length, 1);
  assert.notEqual(initial.sessionId, next.sessionId);

  const refreshPayload = verifyRefreshToken(next.refreshToken);
  assert.equal(refreshPayload.sid, next.sessionId);
});

test("toPublicUser exposes only safe auth flags", () => {
  const user = createMockUser();
  user.emailVerified = true;
  user.twoFactor = { enabled: true };
  const result = toPublicUser(user);

  assert.equal(result.emailVerified, true);
  assert.equal(result.twoFactorEnabled, true);
  assert.equal(result.passwordHash, undefined);
});
