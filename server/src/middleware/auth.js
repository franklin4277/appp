import User from "../models/User.js";
import { verifyAuthToken } from "../services/auth.js";

const unauthorized = (message = "Authentication required.") => {
  const error = new Error(message);
  error.statusCode = 401;
  return error;
};

export const requireAuth = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization || "";
    if (!authHeader.startsWith("Bearer ")) {
      throw unauthorized();
    }

    const token = authHeader.slice("Bearer ".length).trim();
    if (!token) {
      throw unauthorized();
    }

    const payload = verifyAuthToken(token);
    const user = await User.findById(payload.sub);
    if (!user) {
      throw unauthorized("Session is invalid. Please log in again.");
    }

    req.user = user;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      next(unauthorized("Session expired. Please log in again."));
      return;
    }

    if (error.name === "JsonWebTokenError") {
      next(unauthorized("Invalid session token."));
      return;
    }

    next(error.statusCode ? error : unauthorized());
  }
};

