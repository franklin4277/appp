import fs from "fs/promises";
import path from "path";
import { fileURLToPath } from "url";
import Trade from "../models/Trade.js";
import User from "../models/User.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const defaultBackupDir = path.resolve(__dirname, "../../backups");

const backupDir = process.env.BACKUP_DIR
  ? path.resolve(process.env.BACKUP_DIR)
  : defaultBackupDir;

const buildBackupPayload = async () => {
  const [users, trades] = await Promise.all([
    User.find({}, { passwordHash: 0 }).lean(),
    Trade.find({}).lean(),
  ]);

  return {
    generatedAt: new Date().toISOString(),
    users,
    trades,
  };
};

export const createBackupSnapshot = async () => {
  await fs.mkdir(backupDir, { recursive: true });
  const payload = await buildBackupPayload();
  const filename = `backup-${new Date().toISOString().replace(/[:.]/g, "-")}.json`;
  const filepath = path.join(backupDir, filename);
  await fs.writeFile(filepath, JSON.stringify(payload, null, 2), "utf8");
  return filepath;
};

export const startAutoBackup = () => {
  const disabled = process.env.DISABLE_AUTO_BACKUP === "true";
  if (disabled) {
    return null;
  }

  const intervalMinutes = Math.max(Number(process.env.BACKUP_INTERVAL_MINUTES) || 60, 5);
  createBackupSnapshot().catch((error) => {
    console.error("Initial backup failed:", error.message);
  });

  return setInterval(() => {
    createBackupSnapshot().catch((error) => {
      console.error("Scheduled backup failed:", error.message);
    });
  }, intervalMinutes * 60 * 1000);
};

