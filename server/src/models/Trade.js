import mongoose from "mongoose";

const tradeSchema = new mongoose.Schema(
  {
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
      enum: ["Asia", "London", "New York"],
      required: true,
    },
    tradeType: {
      type: String,
      enum: ["Buy", "Sell"],
      required: true,
    },
    setupType: {
      type: String,
      enum: ["Asia Break -> Continuation", "Asia Break -> Reversal"],
      required: true,
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
      enum: ["Win", "Loss", "BE"],
      required: true,
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
        enum: ["Acceptance", "Rejection", ""],
        default: "",
      },
      cleanSetup: {
        type: Boolean,
        default: false,
      },
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
  },
  {
    timestamps: true,
  }
);

tradeSchema.index({ pair: 1, session: 1, setupType: 1, tradeDate: -1 });
tradeSchema.index({ "tags.cleanSetup": 1, tradeDate: -1 });

const Trade = mongoose.model("Trade", tradeSchema);

export default Trade;
