import { Router } from "express";
import { getMe, login, register, updateSettings } from "../controllers/authController.js";
import { requireAuth } from "../middleware/auth.js";

const router = Router();

router.post("/register", register);
router.post("/login", login);
router.get("/me", requireAuth, getMe);
router.patch("/settings", requireAuth, updateSettings);

export default router;

