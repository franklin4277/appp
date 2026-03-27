import mongoose from "mongoose";

const auditLogSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      default: null,
      index: true,
    },
    action: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    targetType: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    targetId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 160,
    },
    ip: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    userAgent: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
    metadata: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
  },
  {
    timestamps: true,
  }
);

auditLogSchema.index({ createdAt: -1 });
auditLogSchema.index({ userId: 1, createdAt: -1 });

const AuditLog = mongoose.model("AuditLog", auditLogSchema);

export default AuditLog;
