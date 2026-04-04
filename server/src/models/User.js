import mongoose from "mongoose";
import {
  DEFAULT_PLAYBOOKS,
  DEFAULT_REVIEW_TOOLKIT,
  DEFAULT_RISK_CONTROLS,
  DEFAULT_STRATEGY_OPTIONS,
} from "../constants/defaults.js";
import { DEFAULT_SUBSCRIPTION } from "../constants/plans.js";

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

  return output.slice(0, 64);
};

const stringListField = {
  type: [String],
  default: [],
  set: normalizeStringList,
};

const cloneList = (value = []) => value.map((item) => String(item));
const clonePlaybooks = (value = []) =>
  value.map((item) => ({
    id: String(item?.id || ""),
    name: String(item?.name || ""),
    setupType: String(item?.setupType || ""),
    targetSession: String(item?.targetSession || ""),
    confirmations: cloneList(item?.confirmations || []),
    invalidations: cloneList(item?.invalidations || []),
    checklist: cloneList(item?.checklist || []),
    notes: String(item?.notes || ""),
  }));
const DEFAULT_PROFILE_ID = "main";
const defaultProfile = () => ({
  id: DEFAULT_PROFILE_ID,
  name: "Main Profile",
  description: "Default journal profile",
  accountSize: 0,
  isDefault: true,
});

const normalizeProfileId = (value, fallback) => {
  const text = normalizeText(value).slice(0, 64);
  return text || fallback;
};

const ensureValidDate = (value, fallback = new Date()) => {
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : fallback;
};

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
    accountSize: {
      type: Number,
      default: 0,
      min: 0,
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

const playbookSchema = new mongoose.Schema(
  {
    id: {
      type: String,
      required: true,
      trim: true,
      maxlength: 64,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: 80,
    },
    setupType: {
      type: String,
      default: "",
      trim: true,
      maxlength: 80,
    },
    targetSession: {
      type: String,
      default: "",
      trim: true,
      maxlength: 40,
    },
    confirmations: stringListField,
    invalidations: stringListField,
    checklist: stringListField,
    notes: {
      type: String,
      default: "",
      trim: true,
      maxlength: 400,
    },
  },
  { _id: false }
);

const reviewToolkitSchema = new mongoose.Schema(
  {
    mistakeTags: stringListField,
    fundedMode: {
      enabled: {
        type: Boolean,
        default: DEFAULT_REVIEW_TOOLKIT.fundedMode.enabled,
      },
      provider: {
        type: String,
        default: DEFAULT_REVIEW_TOOLKIT.fundedMode.provider,
        trim: true,
        maxlength: 80,
      },
      profitTargetPercent: {
        type: Number,
        default: DEFAULT_REVIEW_TOOLKIT.fundedMode.profitTargetPercent,
        min: 0,
      },
      maxTotalDrawdownPercent: {
        type: Number,
        default: DEFAULT_REVIEW_TOOLKIT.fundedMode.maxTotalDrawdownPercent,
        min: 0,
      },
      consistencyPercent: {
        type: Number,
        default: DEFAULT_REVIEW_TOOLKIT.fundedMode.consistencyPercent,
        min: 0,
      },
      minTradingDays: {
        type: Number,
        default: DEFAULT_REVIEW_TOOLKIT.fundedMode.minTradingDays,
        min: 0,
      },
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
  playbooks: clonePlaybooks(DEFAULT_PLAYBOOKS),
  reviewToolkit: {
    mistakeTags: cloneList(DEFAULT_REVIEW_TOOLKIT.mistakeTags),
    fundedMode: { ...DEFAULT_REVIEW_TOOLKIT.fundedMode },
  },
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
      maxRiskPerTradePercent: {
        type: Number,
        default: DEFAULT_RISK_CONTROLS.maxRiskPerTradePercent,
        min: 0,
      },
      dailyProfitTargetPercent: {
        type: Number,
        default: DEFAULT_RISK_CONTROLS.dailyProfitTargetPercent,
        min: 0,
      },
      weeklyProfitTargetPercent: {
        type: Number,
        default: DEFAULT_RISK_CONTROLS.weeklyProfitTargetPercent,
        min: 0,
      },
      maxDailyDrawdownPercent: {
        type: Number,
        default: DEFAULT_RISK_CONTROLS.maxDailyDrawdownPercent,
        min: 0,
      },
      strictChecklistGate: {
        type: Boolean,
        default: DEFAULT_RISK_CONTROLS.strictChecklistGate,
      },
    },
    playbooks: {
      type: [playbookSchema],
      default: () => clonePlaybooks(DEFAULT_PLAYBOOKS),
    },
    reviewToolkit: {
      type: reviewToolkitSchema,
      default: () => ({
        mistakeTags: cloneList(DEFAULT_REVIEW_TOOLKIT.mistakeTags),
        fundedMode: { ...DEFAULT_REVIEW_TOOLKIT.fundedMode },
      }),
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
      default: () => [defaultProfile()],
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
    this.profiles = [defaultProfile()];
  }

  const normalizedProfiles = [];
  const usedIds = new Set();
  this.profiles.forEach((profile, index) => {
    const source = profile && typeof profile === "object" ? profile : {};
    const baseId = normalizeProfileId(source.id, index === 0 ? DEFAULT_PROFILE_ID : `profile-${index + 1}`);
    let nextId = baseId;
    let attempt = 2;
    while (usedIds.has(nextId.toLowerCase())) {
      const suffix = `-${attempt}`;
      nextId = `${baseId.slice(0, Math.max(64 - suffix.length, 1))}${suffix}`;
      attempt += 1;
    }
    usedIds.add(nextId.toLowerCase());

    const name = normalizeText(source.name).slice(0, 80);
    const description = normalizeText(source.description).slice(0, 200);
    const accountSize = Number(source.accountSize);
    normalizedProfiles.push({
      id: nextId,
      name: name || (nextId === DEFAULT_PROFILE_ID ? "Main Profile" : `Profile ${index + 1}`),
      description,
      accountSize: Number.isFinite(accountSize) && accountSize >= 0 ? accountSize : 0,
      isDefault: Boolean(source.isDefault),
      createdAt: ensureValidDate(source.createdAt),
    });
  });
  this.profiles = normalizedProfiles;

  const hasDefault = this.profiles.some((profile) => profile.isDefault);
  if (!hasDefault) {
    this.profiles[0].isDefault = true;
  }
  if (this.profiles.filter((profile) => profile.isDefault).length > 1) {
    let firstDefaultFound = false;
    this.profiles = this.profiles.map((profile) => {
      if (!profile.isDefault) {
        return profile;
      }
      if (!firstDefaultFound) {
        firstDefaultFound = true;
        return profile;
      }
      return { ...profile, isDefault: false };
    });
  }

  this.activeProfileId = normalizeProfileId(this.activeProfileId, "");

  if (!this.activeProfileId || !this.profiles.some((profile) => profile.id === this.activeProfileId)) {
    const defaultProfileEntry = this.profiles.find((profile) => profile.isDefault) || this.profiles[0];
    this.activeProfileId = defaultProfileEntry.id;
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
  if (!this.settings || typeof this.settings !== "object") {
    this.settings = buildDefaultSettings();
  }
  if (!this.settings.options || typeof this.settings.options !== "object") {
    this.settings.options = buildDefaultSettings().options;
  }
  const options = this.settings.options;
  options.pairs = normalizeStringList(options.pairs ?? DEFAULT_STRATEGY_OPTIONS.pairs);
  options.sessions = normalizeStringList(options.sessions ?? DEFAULT_STRATEGY_OPTIONS.sessions);
  options.setupTypes = normalizeStringList(options.setupTypes ?? DEFAULT_STRATEGY_OPTIONS.setupTypes);
  options.tradeTypes = normalizeStringList(options.tradeTypes ?? DEFAULT_STRATEGY_OPTIONS.tradeTypes);
  options.results = normalizeStringList(options.results ?? DEFAULT_STRATEGY_OPTIONS.results);
  options.pocOutcomes = normalizeStringList(options.pocOutcomes ?? DEFAULT_STRATEGY_OPTIONS.pocOutcomes);
  options.emotionTags = normalizeStringList(options.emotionTags ?? DEFAULT_STRATEGY_OPTIONS.emotionTags);

  if (!this.settings.riskControls || typeof this.settings.riskControls !== "object") {
    this.settings.riskControls = { ...DEFAULT_RISK_CONTROLS };
  }
  this.settings.riskControls = {
    ...DEFAULT_RISK_CONTROLS,
    ...this.settings.riskControls,
  };
  if (!Array.isArray(this.settings.playbooks)) {
    this.settings.playbooks = clonePlaybooks(DEFAULT_PLAYBOOKS);
  }
  this.settings.playbooks = this.settings.playbooks
    .map((playbook, index) => {
      const id = normalizeText(playbook?.id || playbook?.name || `playbook-${index + 1}`)
        .toLowerCase()
        .replace(/[^a-z0-9-]+/g, "-")
        .replace(/^-+|-+$/g, "")
        .slice(0, 64);
      const name = normalizeText(playbook?.name || `Playbook ${index + 1}`).slice(0, 80);
      if (!id || !name) {
        return null;
      }
      return {
        id,
        name,
        setupType: normalizeText(playbook?.setupType || "").slice(0, 80),
        targetSession: normalizeText(playbook?.targetSession || "").slice(0, 40),
        confirmations: normalizeStringList(playbook?.confirmations || []),
        invalidations: normalizeStringList(playbook?.invalidations || []),
        checklist: normalizeStringList(playbook?.checklist || []),
        notes: normalizeText(playbook?.notes || "").slice(0, 400),
      };
    })
    .filter(Boolean);
  if (!this.settings.playbooks.length) {
    this.settings.playbooks = clonePlaybooks(DEFAULT_PLAYBOOKS);
  }
  if (!this.settings.reviewToolkit || typeof this.settings.reviewToolkit !== "object") {
    this.settings.reviewToolkit = {
      mistakeTags: cloneList(DEFAULT_REVIEW_TOOLKIT.mistakeTags),
      fundedMode: { ...DEFAULT_REVIEW_TOOLKIT.fundedMode },
    };
  }
  this.settings.reviewToolkit.mistakeTags = normalizeStringList(
    this.settings.reviewToolkit.mistakeTags ?? DEFAULT_REVIEW_TOOLKIT.mistakeTags
  );
  this.settings.reviewToolkit.fundedMode = {
    ...DEFAULT_REVIEW_TOOLKIT.fundedMode,
    ...(this.settings.reviewToolkit.fundedMode || {}),
  };
  this.subscription.planId = this.subscription.planId || DEFAULT_SUBSCRIPTION.planId;
  this.subscription.status = this.subscription.status || DEFAULT_SUBSCRIPTION.status;
  this.subscription.provider = this.subscription.provider || DEFAULT_SUBSCRIPTION.provider;

  next();
});

userSchema.index({ "emailVerification.tokenHash": 1 });
userSchema.index({ "passwordReset.tokenHash": 1 });

const User = mongoose.model("User", userSchema);

export default User;
