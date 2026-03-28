import mongoose from "mongoose";

const analyticsSnapshotSchema = new mongoose.Schema(
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
      index: true,
    },
    scopeKey: {
      type: String,
      required: true,
      trim: true,
      default: "all",
      index: true,
    },
    filter: {
      pair: {
        type: String,
        default: "",
        trim: true,
      },
      session: {
        type: String,
        default: "",
        trim: true,
      },
      setupType: {
        type: String,
        default: "",
        trim: true,
      },
      cleanOnly: {
        type: Boolean,
        default: false,
      },
    },
    totalTrades: {
      type: Number,
      default: 0,
    },
    analytics: {
      type: mongoose.Schema.Types.Mixed,
      default: {},
    },
    generatedAt: {
      type: Date,
      default: Date.now,
    },
  },
  {
    timestamps: true,
  }
);

analyticsSnapshotSchema.index(
  {
    userId: 1,
    profileId: 1,
    scopeKey: 1,
  },
  { unique: true }
);

const AnalyticsSnapshot = mongoose.model("AnalyticsSnapshot", analyticsSnapshotSchema);

export default AnalyticsSnapshot;
