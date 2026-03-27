import AuditLog from "../models/AuditLog.js";

const safeMeta = (value) => {
  if (!value || typeof value !== "object") {
    return {};
  }

  try {
    return JSON.parse(JSON.stringify(value));
  } catch {
    return {};
  }
};

const pickIp = (req) =>
  String(
    req?.headers?.["x-forwarded-for"]?.split?.(",")?.[0]?.trim?.() ||
      req?.ip ||
      req?.socket?.remoteAddress ||
      ""
  ).slice(0, 80);

export const recordAudit = async ({
  req,
  userId = null,
  action,
  targetType = "",
  targetId = "",
  metadata = {},
}) => {
  if (!action) {
    return;
  }

  try {
    await AuditLog.create({
      userId: userId || req?.user?._id || null,
      action: String(action),
      targetType: String(targetType || ""),
      targetId: String(targetId || ""),
      ip: pickIp(req),
      userAgent: String(req?.headers?.["user-agent"] || "").slice(0, 300),
      metadata: safeMeta(metadata),
    });
  } catch (error) {
    console.warn("Audit log write failed:", error.message);
  }
};
