import mongoose from "mongoose";

const bridgeIngestEventSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    profileId: {
      type: String,
      default: "main",
      trim: true,
      index: true,
    },
    bridge: {
      type: String,
      default: "mt5",
      trim: true,
      maxlength: 40,
      index: true,
    },
    source: {
      type: String,
      default: "mt5",
      trim: true,
      maxlength: 40,
    },
    externalTradeId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
      index: true,
    },
    eventType: {
      type: String,
      default: "",
      trim: true,
      maxlength: 20,
      index: true,
    },
    payloadRaw: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    payloadNormalized: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    payloadDigest: {
      type: String,
      required: true,
      trim: true,
      maxlength: 120,
      index: true,
    },
    requestMeta: {
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
      signatureVerified: {
        type: Boolean,
        default: false,
      },
      nonceHash: {
        type: String,
        default: "",
        trim: true,
      },
      timestamp: {
        type: String,
        default: "",
        trim: true,
      },
    },
    status: {
      type: String,
      default: "received",
      trim: true,
      maxlength: 20,
      index: true,
    },
    attempts: {
      type: Number,
      default: 0,
    },
    lastError: {
      type: String,
      default: "",
      trim: true,
      maxlength: 400,
    },
    processedAt: {
      type: Date,
      default: null,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

bridgeIngestEventSchema.index({ userId: 1, payloadDigest: 1 }, { unique: true });
bridgeIngestEventSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const BridgeIngestEvent = mongoose.model("BridgeIngestEvent", bridgeIngestEventSchema);

export default BridgeIngestEvent;
