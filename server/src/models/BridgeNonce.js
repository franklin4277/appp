import mongoose from "mongoose";

const bridgeNonceSchema = new mongoose.Schema(
  {
    userId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    nonceHash: {
      type: String,
      required: true,
      trim: true,
    },
    expiresAt: {
      type: Date,
      required: true,
    },
  },
  {
    timestamps: true,
  }
);

bridgeNonceSchema.index({ userId: 1, nonceHash: 1 }, { unique: true });
bridgeNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const BridgeNonce = mongoose.model("BridgeNonce", bridgeNonceSchema);

export default BridgeNonce;
