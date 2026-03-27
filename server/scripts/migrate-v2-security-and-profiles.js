import dotenv from "dotenv";
import mongoose from "mongoose";
import User from "../src/models/User.js";
import Trade from "../src/models/Trade.js";
import { connectDatabase } from "../src/services/db.js";
import { ensureUserProfiles, resolveDefaultProfileId } from "../src/services/auth.js";

dotenv.config();

const normalizeSecurityFields = (user) => {
  let changed = false;

  if (typeof user.emailVerified !== "boolean") {
    user.emailVerified = false;
    changed = true;
  }

  if (!user.emailVerification || typeof user.emailVerification !== "object") {
    user.emailVerification = {};
    changed = true;
  }

  if (!user.passwordReset || typeof user.passwordReset !== "object") {
    user.passwordReset = {};
    changed = true;
  }

  if (!user.twoFactor || typeof user.twoFactor !== "object") {
    user.twoFactor = {
      enabled: false,
      method: "email_code",
      challengeId: "",
      challengeHash: "",
      challengeExpiresAt: null,
      challengeAttempts: 0,
      lastChallengeAt: null,
    };
    changed = true;
  }

  return changed;
};

const run = async () => {
  const mongoUri = String(process.env.MONGODB_URI || "").trim();
  if (!mongoUri) {
    throw new Error("MONGODB_URI is required.");
  }

  await connectDatabase(mongoUri);
  console.log("Connected to MongoDB.");

  let usersScanned = 0;
  let usersUpdated = 0;
  const defaultProfilesByUser = new Map();

  const userCursor = User.find({}).cursor();
  for await (const user of userCursor) {
    usersScanned += 1;
    const beforeProfile = String(user.activeProfileId || "");
    ensureUserProfiles(user);
    const defaultProfileId = resolveDefaultProfileId(user);
    defaultProfilesByUser.set(user._id.toString(), defaultProfileId);

    const securityChanged = normalizeSecurityFields(user);
    const profileChanged = beforeProfile !== String(user.activeProfileId || "");
    const modified = securityChanged || profileChanged || user.isModified("profiles");

    if (modified) {
      await user.save();
      usersUpdated += 1;
    }
  }

  let tradesScanned = 0;
  let tradesUpdated = 0;
  let bulk = [];

  const tradeCursor = Trade.find({
    $or: [{ profileId: { $exists: false } }, { profileId: null }, { profileId: "" }],
  }).cursor();

  for await (const trade of tradeCursor) {
    tradesScanned += 1;
    const fallbackProfile = defaultProfilesByUser.get(trade.userId?.toString?.()) || "main";
    bulk.push({
      updateOne: {
        filter: { _id: trade._id },
        update: { $set: { profileId: fallbackProfile } },
      },
    });

    if (bulk.length >= 500) {
      const result = await Trade.bulkWrite(bulk);
      tradesUpdated += result.modifiedCount || 0;
      bulk = [];
    }
  }

  if (bulk.length) {
    const result = await Trade.bulkWrite(bulk);
    tradesUpdated += result.modifiedCount || 0;
  }

  console.log(
    `Migration complete. Users scanned=${usersScanned}, users updated=${usersUpdated}, ` +
      `trades scanned=${tradesScanned}, trades updated=${tradesUpdated}.`
  );
};

run()
  .catch((error) => {
    console.error("Migration failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
