import mongoose from "mongoose";
import { DEFAULT_RISK_CONTROLS, DEFAULT_STRATEGY_OPTIONS } from "../constants/defaults.js";

const stringListField = {
  type: [String],
  default: [],
};

const cloneList = (value = []) => value.map((item) => String(item));
const DEFAULT_PROFILE_ID = "main";

const profileSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 64,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      minlength: 2,
      maxlength: 80,
    },
    description: {
      type: String,
      default: "",
      trim: true,
      maxlength: 200,
    },
    isDefault: {
      type: Boolean,
      default: false,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const refreshSessionSchema = new mongoose.Schema(
  {
    sessionId: {
      type: String,
      required: true,
      trim: true,
    },
    tokenHash: {
      type: String,
      required: true,
      trim: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
    userAgent: {
      type: String,
      default: "",
      trim: true,
      maxlength: 300,
    },
    ip: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    lastUsedAt: {
      type: Date,
      default: Date.now,
    },
    createdAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

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
      strictChecklistGate: {
        type: Boolean,
        default: DEFAULT_RISK_CONTROLS.strictChecklistGate,
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
    profiles: {
      type: [profileSchema],
      default: () => [
        {
          id: DEFAULT_PROFILE_ID,
          name: "Main Profile",
          description: "Default journal profile",
          isDefault: true,
        },
      ],
    },
    activeProfileId: {
      type: String,
      default: DEFAULT_PROFILE_ID,
      trim: true,
    },
    refreshSessions: {
      type: [refreshSessionSchema],
      default: [],
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

userSchema.pre("save", function normalizeProfiles(next) {
  if (!Array.isArray(this.profiles) || !this.profiles.length) {
    this.profiles = [
      {
        id: DEFAULT_PROFILE_ID,
        name: "Main Profile",
        description: "Default journal profile",
        isDefault: true,
      },
    ];
  }

  const hasDefault = this.profiles.some((profile) => profile.isDefault);
  if (!hasDefault) {
    this.profiles[0].isDefault = true;
  }

  if (!this.activeProfileId || !this.profiles.some((profile) => profile.id === this.activeProfileId)) {
    const defaultProfile = this.profiles.find((profile) => profile.isDefault) || this.profiles[0];
    this.activeProfileId = defaultProfile.id;
  }

  const now = new Date();
  this.refreshSessions = (this.refreshSessions || []).filter((session) => {
    const expiresAt = new Date(session.expiresAt).getTime();
    return Number.isFinite(expiresAt) && expiresAt > now.getTime();
  });

  next();
});

const User = mongoose.model("User", userSchema);

export default User;
