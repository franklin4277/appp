import mongoose from "mongoose";

export const connectDatabase = async (uri) => {
  if (!uri) {
    throw new Error("MONGODB_URI is not configured.");
  }

  mongoose.set("strictQuery", true);
  await mongoose.connect(uri);
};
