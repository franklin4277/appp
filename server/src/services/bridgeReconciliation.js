import BridgeIngestEvent from "../models/BridgeIngestEvent.js";
import Trade from "../models/Trade.js";
import User from "../models/User.js";
import { scheduleDefaultAnalyticsSnapshotRebuild } from "./analyticsSnapshot.js";
import { logError, logInfo } from "./logger.js";

const intervalSeconds = () => Math.max(60, Number(process.env.BRIDGE_RECONCILE_INTERVAL_SECONDS || 180) || 180);
const staleMinutes = () => Math.max(10, Number(process.env.BRIDGE_STALE_OPEN_TRADE_MINUTES || 25) || 25);
const batchSize = () => Math.max(20, Math.min(Number(process.env.BRIDGE_RECONCILE_BATCH_SIZE || 120) || 120, 500));

let reconcileTimer = null;
let reconcileRunning = false;

const toDate = (value, fallback = null) => {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return fallback;
  }
  return date;
};

const toNumber = (value, fallback = null) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const resolveExitEventQuery = (trade) => ({
  userId: trade.userId,
  externalTradeId: String(trade.automation?.externalTradeId || ""),
  eventType: { $in: ["exit", "full"] },
});

const closeTradeFromEvent = async ({ trade, event }) => {
  const normalized = event?.payloadNormalized || {};
  const tradePayload = normalized.trade || {};
  const automationPayload = normalized.automation || {};
  const qualityFlags = Array.isArray(normalized.qualityFlags) ? normalized.qualityFlags : [];
  const exitTime = toDate(automationPayload.exitTime, event.createdAt);

  const update = {
    result: String(tradePayload.result || trade.result || "BE"),
    rrAchieved: toNumber(tradePayload.rrAchieved, trade.rrAchieved),
    plannedRR: toNumber(tradePayload.plannedRR, trade.plannedRR),
    "automation.status": "closed",
    "automation.eventType": String(normalized.eventType || "exit"),
    "automation.exitPrice": toNumber(automationPayload.exitPrice, trade.automation?.exitPrice ?? null),
    "automation.exitTime": exitTime,
    "automation.lastSyncAt": new Date(),
    "automation.reconciliationCheckedAt": new Date(),
    "mediaProcessing.updatedAt": new Date(),
  };

  await Trade.updateOne(
    { _id: trade._id },
    {
      $set: update,
      $addToSet: {
        qualityFlags: { $each: ["reconciled_from_mt5_history", ...qualityFlags] },
      },
    }
  );

  if (event.status !== "processed") {
    await BridgeIngestEvent.updateOne(
      { _id: event._id },
      {
        $set: {
          status: "processed",
          processedAt: new Date(),
          lastError: "",
        },
        $inc: {
          attempts: 1,
        },
      }
    );
  }
};

const markStaleTrade = async (trade) => {
  await Trade.updateOne(
    { _id: trade._id },
    {
      $addToSet: {
        qualityFlags: "stale_open_trade",
      },
      $set: {
        "automation.reconciliationCheckedAt": new Date(),
      },
    }
  );
};

export const runBridgeReconciliationPass = async () => {
  if (reconcileRunning) {
    return;
  }
  reconcileRunning = true;

  const now = Date.now();
  const staleCutoff = new Date(now - staleMinutes() * 60 * 1000);
  const profileRebuild = new Map();
  let reconciled = 0;
  let staleMarked = 0;

  try {
    const openTrades = await Trade.find({
      "automation.status": "open",
      "automation.externalTradeId": { $exists: true, $ne: "" },
    })
      .sort({ tradeDate: 1 })
      .limit(batchSize());

    for (const trade of openTrades) {
      const exitEvent = await BridgeIngestEvent.findOne(resolveExitEventQuery(trade))
        .sort({ createdAt: -1 })
        .lean();

      if (exitEvent) {
        await closeTradeFromEvent({
          trade,
          event: exitEvent,
        });
        reconciled += 1;

        const profileKey = `${String(trade.userId)}:${trade.profileId}`;
        profileRebuild.set(profileKey, {
          userId: String(trade.userId),
          profileId: trade.profileId,
        });
        continue;
      }

      const tradeTs = toDate(trade.tradeDate);
      if (tradeTs && tradeTs < staleCutoff) {
        await markStaleTrade(trade);
        staleMarked += 1;
      }
    }

    for (const entry of profileRebuild.values()) {
      const user = await User.findById(entry.userId);
      if (!user) {
        continue;
      }
      scheduleDefaultAnalyticsSnapshotRebuild({
        user,
        profileId: entry.profileId,
      });
    }

    if (reconciled || staleMarked) {
      logInfo("bridge.reconciliation.pass.completed", {
        reconciled,
        staleMarked,
      });
    }
  } catch (error) {
    logError("bridge.reconciliation.pass.failed", {
      message: error.message,
    });
  } finally {
    reconcileRunning = false;
  }
};

export const startBridgeReconciliationWorker = () => {
  if (reconcileTimer) {
    return reconcileTimer;
  }

  const intervalMs = intervalSeconds() * 1000;
  reconcileTimer = setInterval(() => {
    void runBridgeReconciliationPass();
  }, intervalMs);

  // Prime one pass shortly after startup.
  setTimeout(() => {
    void runBridgeReconciliationPass();
  }, 4000);

  logInfo("bridge.reconciliation.worker.started", {
    intervalSeconds: intervalSeconds(),
    staleOpenTradeMinutes: staleMinutes(),
    batchSize: batchSize(),
  });

  return reconcileTimer;
};

