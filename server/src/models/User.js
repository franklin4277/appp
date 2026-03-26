import mongoose from "mongoose";
import { DEFAULT_RISK_CONTROLS, DEFAULT_STRATEGY_OPTIONS } from "../constants/defaults.js";

const stringListField = {
  type: [String],
  default: [],
};

const cloneList = (value = []) => value.map((item) => String(item));

const buildDefaultSettings = () => ({
  options: {
    pairs: cloneList(DEFAULT_STRATEGY_OPTIONS.pairs),
    sessions: cloneList(DEFAULT_STRATEGY_OPTIONS.sessions),
    setupTypes: cloneList(DEFAULT_STRATEGY_OPTIONS.setupTypes),
    tradeTypes: cloneList(DEFAULT_STRATEGY_OPTIONS.tradeTypes),
    results: cloneList(DEFAULT_STRATEGY_OPTIONS.results),
    pocOutcomes: cloneList(DEFAULT_STRATEGY_OPTIONS.pocOutcomes),
    emotionTags: cloneList(DEFAULT_STRATEGY_OPTIONS.emotionTags),
  },
  riskControls: { ...DEFAULT_RISK_CONTROLS },
});

const settingsSchema = new mongoose.Schema(
  {
    options: {
      pairs: stringListField,
      sessions: stringListField,
      setupTypes: stringListField,
      tradeTypes: stringListField,
      results: stringListField,
      pocOutcomes: stringListField,
      emotionTags: stringListField,
    },
    riskControls: {
      requireRuleAlignment: {
        type: Boolean,
        default: DEFAULT_RISK_CONTROLS.requireRuleAlignment,
      },
      maxTradesPerSession: {
        type: Number,
        default: DEFAULT_RISK_CONTROLS.maxTradesPerSession,
      },
      cooldownMinutesAfterLoss: {
        type: Number,
        default: DEFAULT_RISK_CONTROLS.cooldownMinutesAfterLoss,
      },
      stopForDayLossRR: {
        type: Number,
        default: DEFAULT_RISK_CONTROLS.stopForDayLossRR,
      },
    },
  },
  { _id: false }
);

const userSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      maxlength: 160,
    },
    passwordHash: {
      type: String,
      required: true,
    },
    settings: {
      type: settingsSchema,
      default: buildDefaultSettings,
    },
    lastLoginAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

const User = mongoose.model("User", userSchema);

export default User;
