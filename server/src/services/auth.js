import jwt from "jsonwebtoken";

const DEFAULT_EXPIRES_IN = "7d";
const DEV_SECRET = "local-dev-only-change-me";

const resolveSecret = () => {
  const secret = process.env.JWT_SECRET || "";
  if (secret) {
    return secret;
  }

  if (process.env.NODE_ENV === "production") {
    throw new Error("JWT_SECRET is required in production.");
  }

  return DEV_SECRET;
};

export const signAuthToken = (user) =>
  jwt.sign(
    {
      sub: user._id.toString(),
      email: user.email,
      name: user.name,
    },
    resolveSecret(),
    {
      expiresIn: process.env.JWT_EXPIRES_IN || DEFAULT_EXPIRES_IN,
    }
  );

export const verifyAuthToken = (token) => jwt.verify(token, resolveSecret());

export const toPublicUser = (user) => ({
  id: user._id?.toString?.() || user.id,
  name: user.name,
  email: user.email,
  settings: user.settings,
  createdAt: user.createdAt,
  updatedAt: user.updatedAt,
});

