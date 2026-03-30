import Trade from "../models/Trade.js";
import { logError, logInfo } from "./logger.js";

const retentionDays = () => Math.max(1, Number(process.env.RECORDING_RETENTION_DAYS || 14) || 14);
const intervalHours = () => Math.max(1, Number(process.env.RECORDING_RETENTION_INTERVAL_HOURS || 6) || 6);

let retentionTimer = null;
let retentionRunning = false;

export const runRecordingRetentionPass = async () => {
  if (retentionRunning) {
    return;
  }
  retentionRunning = true;

  try {
    const cutoff = new Date(Date.now() - retentionDays() * 24 * 60 * 60 * 1000);
    const result = await Trade.updateMany(
      {
        "automation.screenRecordingUrl": { $exists: true, $ne: "" },
        tradeDate: { $lt: cutoff },
      },
      {
        $set: {
          "automation.screenRecordingUrl": "",
          "automation.recordingDurationSeconds": 0,
          "mediaProcessing.updatedAt": new Date(),
        },
        $addToSet: {
          qualityFlags: "recording_retention_expired",
        },
      }
    );

    if (result.modifiedCount) {
      logInfo("recording.retention.cleaned", {
        modifiedCount: result.modifiedCount,
        retentionDays: retentionDays(),
      });
    }
  } catch (error) {
    logError("recording.retention.failed", {
      message: error.message,
    });
  } finally {
    retentionRunning = false;
  }
};

export const startRecordingRetentionWorker = () => {
  if (retentionTimer) {
    return retentionTimer;
  }

  const intervalMs = intervalHours() * 60 * 60 * 1000;
  retentionTimer = setInterval(() => {
    void runRecordingRetentionPass();
  }, intervalMs);

  setTimeout(() => {
    void runRecordingRetentionPass();
  }, 6000);

  logInfo("recording.retention.worker.started", {
    retentionDays: retentionDays(),
    intervalHours: intervalHours(),
  });

  return retentionTimer;
};

