import mongoose from "mongoose";

const tradeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    profileId: {
      type: String,
      required: true,
      trim: true,
      default: "main",
      index: true,
    },
    clientTradeId: {
      type: String,
      trim: true,
      default: "",
      maxlength: 120,
    },
    pair: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
    },
    tradeDate: {
      type: Date,
      required: true,
    },
    session: {
      type: String,
      required: true,
      trim: true,
    },
    tradeType: {
      type: String,
      required: true,
      trim: true,
    },
    setupType: {
      type: String,
      required: true,
      trim: true,
    },
    strategyFingerprint: {
      type: String,
      default: "",
      trim: true,
      maxlength: 260,
      index: true,
    },
    entryPrice: {
      type: Number,
      required: true,
    },
    stopLoss: {
      type: Number,
      required: true,
    },
    takeProfit: {
      type: Number,
      required: true,
    },
    riskPercent: {
      type: Number,
      default: 0,
    },
    lotSize: {
      type: Number,
      default: null,
    },
    result: {
      type: String,
      required: true,
      trim: true,
    },
    rrAchieved: {
      type: Number,
      required: true,
    },
    plannedRR: {
      type: Number,
      required: true,
    },
    tags: {
      asiaHighLowUsed: {
        type: Boolean,
        required: true,
      },
      pocInteraction: {
        type: Boolean,
        required: true,
      },
      pocOutcome: {
        type: String,
        trim: true,
        default: "",
      },
      cleanSetup: {
        type: Boolean,
        default: false,
      },
    },
    ruleBreakReason: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
    guardrailWarnings: {
      type: [String],
      default: [],
    },
    qualityFlags: {
      type: [String],
      default: [],
    },
    notes: {
      priceAction: {
        type: String,
        default: "",
      },
      executionReview: {
        type: String,
        default: "",
      },
      emotionalState: {
        type: String,
        default: "",
      },
    },
    screenshots: {
      before: {
        type: String,
        default: "",
      },
      after: {
        type: String,
        default: "",
      },
      beforeNote: {
        type: String,
        default: "",
        trim: true,
        maxlength: 400,
      },
      afterNote: {
        type: String,
        default: "",
        trim: true,
        maxlength: 400,
      },
    },
    importSource: {
      type: String,
      default: "",
      trim: true,
    },
    storageProvider: {
      type: String,
      default: "",
      trim: true,
    },
    mediaProcessing: {
      status: {
        type: String,
        default: "ready",
        trim: true,
        maxlength: 20,
      },
      pendingItems: {
        type: [String],
        default: [],
      },
      lastError: {
        type: String,
        default: "",
        trim: true,
        maxlength: 400,
      },
      queuedAt: {
        type: Date,
        default: null,
      },
      updatedAt: {
        type: Date,
        default: null,
      },
    },
    automation: {
      source: {
        type: String,
        default: "manual",
        trim: true,
        maxlength: 40,
      },
      bridge: {
        type: String,
        default: "",
        trim: true,
        maxlength: 40,
      },
      status: {
        type: String,
        default: "closed",
        trim: true,
        maxlength: 20,
      },
      eventType: {
        type: String,
        default: "",
        trim: true,
        maxlength: 20,
      },
      externalTradeId: {
        type: String,
        default: "",
        trim: true,
        maxlength: 120,
      },
      mt5AccountId: {
        type: String,
        default: "",
        trim: true,
        maxlength: 120,
      },
      mt5PositionId: {
        type: String,
        default: "",
        trim: true,
        maxlength: 120,
      },
      mt5OrderId: {
        type: String,
        default: "",
        trim: true,
        maxlength: 120,
      },
      screenRecordingUrl: {
        type: String,
        default: "",
        trim: true,
      },
      recordingDurationSeconds: {
        type: Number,
        default: 0,
      },
      autoCapturedBefore: {
        type: Boolean,
        default: false,
      },
      autoCapturedAfter: {
        type: Boolean,
        default: false,
      },
      entryCapturedAt: {
        type: Date,
        default: null,
      },
      exitCapturedAt: {
        type: Date,
        default: null,
      },
      lastSyncAt: {
        type: Date,
        default: null,
      },
      exitPrice: {
        type: Number,
        default: null,
      },
      exitTime: {
        type: Date,
        default: null,
      },
      rawPayloadDigest: {
        type: String,
        default: "",
        trim: true,
        maxlength: 120,
      },
      reconciliationCheckedAt: {
        type: Date,
        default: null,
      },
    },
  },
  {
    timestamps: true,
  }
);

tradeSchema.index({ userId: 1, profileId: 1, pair: 1, session: 1, setupType: 1, tradeDate: -1 });
tradeSchema.index({ userId: 1, profileId: 1, "tags.cleanSetup": 1, tradeDate: -1 });
tradeSchema.index({ userId: 1, profileId: 1, tradeDate: -1 });
tradeSchema.index({ userId: 1, profileId: 1, strategyFingerprint: 1, tradeDate: -1 });
tradeSchema.index({ userId: 1, profileId: 1, "automation.source": 1, tradeDate: -1 });
tradeSchema.index({ userId: 1, profileId: 1, "automation.status": 1, tradeDate: -1 });
tradeSchema.index(
  { userId: 1, clientTradeId: 1 },
  {
    unique: true,
    partialFilterExpression: { clientTradeId: { $exists: true, $ne: "" } },
  }
);
tradeSchema.index(
  { userId: 1, "automation.externalTradeId": 1 },
  {
    unique: true,
    partialFilterExpression: { "automation.externalTradeId": { $exists: true, $ne: "" } },
  }
);

const Trade = mongoose.model("Trade", tradeSchema);

export default Trade;
