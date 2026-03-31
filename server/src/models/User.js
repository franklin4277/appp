import mongoose from "mongoose";
import { DEFAULT_RISK_CONTROLS, DEFAULT_STRATEGY_OPTIONS } from "../constants/defaults.js";
import { DEFAULT_SUBSCRIPTION } from "../constants/plans.js";

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

const tokenFlowSchema = new mongoose.Schema(
  {
    tokenHash: {
      type: String,
      default: "",
      trim: true,
    },
    expiresAt: {
      type: Date,
      default: null,
    },
    requestedAt: {
      type: Date,
      default: null,
    },
    usedAt: {
      type: Date,
      default: null,
    },
    verifiedAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const twoFactorSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    method: {
      type: String,
      default: "email_code",
      trim: true,
      maxlength: 40,
    },
    challengeId: {
      type: String,
      default: "",
      trim: true,
      maxlength: 120,
    },
    challengeHash: {
      type: String,
      default: "",
      trim: true,
    },
    challengeExpiresAt: {
      type: Date,
      default: null,
    },
    challengeAttempts: {
      type: Number,
      default: 0,
    },
    lastChallengeAt: {
      type: Date,
      default: null,
    },
  },
  { _id: false }
);

const mt5IntegrationSchema = new mongoose.Schema(
  {
    enabled: {
      type: Boolean,
      default: false,
    },
    keyHash: {
      type: String,
      default: "",
      trim: true,
    },
    keyHint: {
      type: String,
      default: "",
      trim: true,
      maxlength: 20,
    },
    label: {
      type: String,
      default: "MT5 Bridge",
      trim: true,
      maxlength: 80,
    },
    createdAt: {
      type: Date,
      default: null,
    },
    lastUsedAt: {
      type: Date,
      default: null,
    },
    lastEventAt: {
      type: Date,
      default: null,
    },
    lastEventType: {
      type: String,
      default: "",
      trim: true,
      maxlength: 32,
    },
  },
  { _id: false }
);

const subscriptionSchema = new mongoose.Schema(
  {
    planId: {
      type: String,
      default: DEFAULT_SUBSCRIPTION.planId,
      trim: true,
      maxlength: 40,
    },
    status: {
      type: String,
      default: DEFAULT_SUBSCRIPTION.status,
      trim: true,
      maxlength: 40,
    },
    provider: {
      type: String,
      default: DEFAULT_SUBSCRIPTION.provider,
      trim: true,
      maxlength: 40,
    },
    customerId: {
      type: String,
      default: DEFAULT_SUBSCRIPTION.customerId,
      trim: true,
      maxlength: 120,
    },
    subscriptionId: {
      type: String,
      default: DEFAULT_SUBSCRIPTION.subscriptionId,
      trim: true,
      maxlength: 120,
    },
    currentPeriodEnd: {
      type: Date,
      default: DEFAULT_SUBSCRIPTION.currentPeriodEnd,
    },
    cancelAtPeriodEnd: {
      type: Boolean,
      default: DEFAULT_SUBSCRIPTION.cancelAtPeriodEnd,
    },
    updatedAt: {
      type: Date,
      default: DEFAULT_SUBSCRIPTION.updatedAt,
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
    emailVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    emailVerification: {
      type: tokenFlowSchema,
      default: () => ({}),
    },
    passwordReset: {
      type: tokenFlowSchema,
      default: () => ({}),
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
    twoFactor: {
      type: twoFactorSchema,
      default: () => ({}),
    },
    integrations: {
      mt5: {
        type: mt5IntegrationSchema,
        default: () => ({}),
      },
    },
    subscription: {
      type: subscriptionSchema,
      default: () => ({ ...DEFAULT_SUBSCRIPTION }),
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

  if (!this.emailVerification || typeof this.emailVerification !== "object") {
    this.emailVerification = {};
  }
  if (!this.passwordReset || typeof this.passwordReset !== "object") {
    this.passwordReset = {};
  }
  if (!this.twoFactor || typeof this.twoFactor !== "object") {
    this.twoFactor = {};
  }
  if (!this.integrations || typeof this.integrations !== "object") {
    this.integrations = {};
  }
  if (!this.integrations.mt5 || typeof this.integrations.mt5 !== "object") {
    this.integrations.mt5 = {};
  }
  if (!this.subscription || typeof this.subscription !== "object") {
    this.subscription = { ...DEFAULT_SUBSCRIPTION };
  }
  this.subscription.planId = this.subscription.planId || DEFAULT_SUBSCRIPTION.planId;
  this.subscription.status = this.subscription.status || DEFAULT_SUBSCRIPTION.status;
  this.subscription.provider = this.subscription.provider || DEFAULT_SUBSCRIPTION.provider;

  next();
});

userSchema.index({ "emailVerification.tokenHash": 1 });
userSchema.index({ "passwordReset.tokenHash": 1 });

const User = mongoose.model("User", userSchema);

export default User;
