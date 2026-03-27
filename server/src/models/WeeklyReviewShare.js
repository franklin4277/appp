import mongoose from "mongoose";

const weeklyReviewShareSchema = new mongoose.Schema(
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
    tokenHash: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true,
    },
    title: {
      type: String,
      trim: true,
      default: "Weekly report",
      maxlength: 120,
    },
    periodStart: {
      type: String,
      required: true,
    },
    periodEnd: {
      type: String,
      required: true,
    },
    summary: {
      type: Object,
      required: true,
      default: {},
    },
    generatedAt: {
      type: Date,
      required: true,
      default: Date.now,
    },
    expiresAt: {
      type: Date,
      required: true,
      index: true,
    },
    revokedAt: {
      type: Date,
      default: null,
    },
    lastAccessedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  }
);

weeklyReviewShareSchema.index({ userId: 1, profileId: 1, createdAt: -1 });

const WeeklyReviewShare = mongoose.model("WeeklyReviewShare", weeklyReviewShareSchema);

export default WeeklyReviewShare;
