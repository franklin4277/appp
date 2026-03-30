import crypto from "crypto";
import BridgeNonce from "../models/BridgeNonce.js";
import { hashToken } from "./auth.js";

const toText = (value = "") => String(value || "").trim();

const unauthorized = (message = "Bridge security verification failed.") => {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
};

const bridgeIpAllowlist = () =>
  String(process.env.MT5_BRIDGE_IP_ALLOWLIST || "")
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

const bridgeTimestampToleranceSeconds = () =>
  Math.max(30, Number(process.env.MT5_BRIDGE_TIMESTAMP_TOLERANCE_SECONDS || 300) || 300);

const requireHmac = () => {
  if (process.env.MT5_BRIDGE_REQUIRE_HMAC === undefined) {
    return process.env.NODE_ENV === "production";
  }
  return String(process.env.MT5_BRIDGE_REQUIRE_HMAC).trim().toLowerCase() === "true";
};

export const pickRequestIp = (req) =>
  toText(req?.headers?.["x-forwarded-for"]?.split?.(",")?.[0]) ||
  toText(req?.ip) ||
  toText(req?.socket?.remoteAddress);

export const assertBridgeIpAllowed = (req) => {
  const allowlist = bridgeIpAllowlist();
  if (!allowlist.length) {
    return;
  }

  const requestIp = pickRequestIp(req);
  if (allowlist.includes(requestIp)) {
    return;
  }

  const ipDenied = unauthorized("Bridge IP is not allowed.");
  ipDenied.statusCode = 403;
  throw ipDenied;
};

const parseSignature = (value = "") => {
  const signature = toText(value);
  if (!signature) {
    return "";
  }
  if (signature.toLowerCase().startsWith("sha256=")) {
    return signature.slice("sha256=".length);
  }
  return signature;
};

const buildExpectedSignature = ({ key, timestamp, nonce, rawBody }) =>
  crypto
    .createHmac("sha256", String(key || ""))
    .update(`${timestamp}.${nonce}.${rawBody}`)
    .digest("hex");

const timingSafeEqualHex = (left = "", right = "") => {
  const a = Buffer.from(String(left || ""), "hex");
  const b = Buffer.from(String(right || ""), "hex");
  if (a.length !== b.length || !a.length) {
    return false;
  }
  return crypto.timingSafeEqual(a, b);
};

export const verifyBridgeHmac = ({ req, integrationKey }) => {
  const signature = parseSignature(req.headers["x-bridge-signature"]);
  const timestamp = toText(req.headers["x-bridge-ts"] || req.headers["x-bridge-timestamp"]);
  const nonce = toText(req.headers["x-bridge-nonce"]);
  const rawBody = String(req.rawBody || "");
  const shouldVerify = requireHmac() || Boolean(signature || timestamp || nonce);

  if (!shouldVerify) {
    return {
      signatureVerified: false,
      timestamp: "",
      nonce,
      nonceHash: "",
    };
  }

  if (!signature || !timestamp || !nonce) {
    throw unauthorized("Bridge signature, timestamp, and nonce are required.");
  }

  const numericTs = Number(timestamp);
  if (!Number.isFinite(numericTs)) {
    throw unauthorized("Bridge timestamp is invalid.");
  }

  const toleranceSeconds = bridgeTimestampToleranceSeconds();
  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - numericTs) > toleranceSeconds) {
    throw unauthorized("Bridge timestamp is outside allowed window.");
  }

  const expected = buildExpectedSignature({
    key: integrationKey,
    timestamp,
    nonce,
    rawBody,
  });

  if (!timingSafeEqualHex(signature, expected)) {
    throw unauthorized("Bridge signature does not match.");
  }

  return {
    signatureVerified: true,
    timestamp,
    nonce,
    nonceHash: hashToken(nonce),
    nonceTtlSeconds: toleranceSeconds * 2,
  };
};

export const assertBridgeNonceUnused = async ({ userId, nonceHash = "", ttlSeconds = 600 }) => {
  if (!nonceHash) {
    return;
  }

  const expiresAt = new Date(Date.now() + Math.max(60, Number(ttlSeconds) || 600) * 1000);
  try {
    await BridgeNonce.create({
      userId,
      nonceHash,
      expiresAt,
    });
  } catch (error) {
    if (error?.code === 11000) {
      throw unauthorized("Bridge nonce already used (replay blocked).");
    }
    throw error;
  }
};

