import mongoose from "mongoose";

const normalizeText = (value = "") =>
  String(value || "")
    .replace(/\u0000/g, "")
    .trim()
    .replace(/\s+/g, " ");

const normalizeStringList = (value = []) => {
  const source = Array.isArray(value) ? value : [value];
  const seen = new Set();
  const output = [];

  source.forEach((item) => {
    const text = normalizeText(item);
    if (!text) {
      return;
    }
    const key = text.toLowerCase();
    if (seen.has(key)) {
      return;
    }
    seen.add(key);
    output.push(text);
  });

  return output;
};

const normalizeTradeType = (value = "") => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "buy") {
    return "Buy";
  }
  if (normalized === "sell") {
    return "Sell";
  }
  return normalizeText(value);
};

const normalizeResult = (value = "") => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "win" || normalized === "w") {
    return "Win";
  }
  if (normalized === "loss" || normalized === "lose" || normalized === "l") {
    return "Loss";
  }
  if (normalized === "be" || normalized === "breakeven" || normalized === "break-even") {
    return "BE";
  }
  return normalizeText(value);
};

const normalizeAutomationStatus = (value = "") => {
  const normalized = normalizeText(value).toLowerCase();
  if (normalized === "open") {
    return "open";
  }
  if (normalized === "closed") {
    return "closed";
  }
  return normalizeText(value).toLowerCase();
};

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
      set: normalizeText,
    },
    tradeType: {
      type: String,
      required: true,
      trim: true,
      set: normalizeTradeType,
    },
    setupType: {
      type: String,
      required: true,
      trim: true,
      set: normalizeText,
    },
    playbookId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 64,
    },
    playbookName: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
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
      set: normalizeResult,
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
        set: normalizeText,
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
      set: normalizeStringList,
    },
    qualityFlags: {
      type: [String],
      default: [],
      set: normalizeStringList,
    },
    mistakeTags: {
      type: [String],
      default: [],
      set: normalizeStringList,
    },
    notes: {
      priceAction: {
        type: String,
        default: "",
        trim: true,
      },
      executionReview: {
        type: String,
        default: "",
        trim: true,
      },
      emotionalState: {
        type: String,
        default: "",
        trim: true,
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
    lifecycle: {
      scaleInCount: {
        type: Number,
        default: 0,
      },
      scaleOutCount: {
        type: Number,
        default: 0,
      },
      partialCloseCount: {
        type: Number,
        default: 0,
      },
      movedStopToBreakeven: {
        type: Boolean,
        default: false,
      },
      trailingStopUsed: {
        type: Boolean,
        default: false,
      },
      exitReason: {
        type: String,
        default: "",
        trim: true,
        maxlength: 120,
        set: normalizeText,
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
        set: normalizeAutomationStatus,
      },
      pendingItems: {
        type: [String],
        default: [],
        set: normalizeStringList,
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
        set: (value) => normalizeText(value).toLowerCase(),
      },
      bridge: {
        type: String,
        default: "",
        trim: true,
        maxlength: 40,
        set: normalizeText,
      },
      status: {
        type: String,
        default: "closed",
        trim: true,
        maxlength: 20,
        set: normalizeAutomationStatus,
      },
      eventType: {
        type: String,
        default: "",
        trim: true,
        maxlength: 20,
        set: (value) => normalizeText(value).toLowerCase(),
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
tradeSchema.index({ userId: 1, profileId: 1, result: 1, tradeDate: -1 });
tradeSchema.index({ userId: 1, profileId: 1, strategyFingerprint: 1, tradeDate: -1 });
tradeSchema.index(
  { userId: 1, profileId: 1, playbookId: 1, tradeDate: -1 },
  {
    partialFilterExpression: { playbookId: { $exists: true, $ne: "" } },
  }
);
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
