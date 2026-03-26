import dotenv from "dotenv";
import app from "./app.js";
import { startAutoBackup } from "./services/backup.js";
import { connectDatabase } from "./services/db.js";

dotenv.config();

const PORT = Number(process.env.PORT) || 5000;
let backupTimer = null;

const warnIfCredentialsLookHardcoded = () => {
  const uri = process.env.MONGODB_URI || "";
  if (!uri) {
    return;
  }

  const decoded = decodeURIComponent(uri);
  if (/tradecircle|password|1234|admin/i.test(decoded)) {
    console.warn(
      "Security warning: MONGODB_URI appears to contain weak or reused credentials. Rotate before production use."
    );
  }
};

const startServer = async () => {
  try {
    warnIfCredentialsLookHardcoded();
    await connectDatabase(process.env.MONGODB_URI);
    backupTimer = startAutoBackup();
    app.listen(PORT, () => {
      console.log(`Server running on http://localhost:${PORT}`);
    });
  } catch (error) {
    console.error("Failed to start server:", error.message);
    if (backupTimer) {
      clearInterval(backupTimer);
    }
    process.exit(1);
  }
};

startServer();
