import mongoose from "mongoose";

const tradeSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
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
  },
  {
    timestamps: true,
  }
);

tradeSchema.index({ userId: 1, pair: 1, session: 1, setupType: 1, tradeDate: -1 });
tradeSchema.index({ userId: 1, "tags.cleanSetup": 1, tradeDate: -1 });
tradeSchema.index({ userId: 1, tradeDate: -1 });

const Trade = mongoose.model("Trade", tradeSchema);

export default Trade;
