import Trade from "../models/Trade.js";
import { storeScreenshot } from "./storage.js";
import { logError, logInfo } from "./logger.js";

const queue = [];
let workerRunning = false;

const mergeProviders = (...values) =>
  [...new Set(values.flatMap((value) => String(value || "").split(",").map((item) => item.trim()).filter(Boolean)))].join(
    ","
  );

const ensureSlotTask = (task = {}) => {
  if (!task || typeof task !== "object") {
    return null;
  }

  if (task.kind === "url") {
    const url = String(task.url || "").trim();
    if (!url) {
      return null;
    }
    return {
      kind: "url",
      url,
      autoCaptured: Boolean(task.autoCaptured),
      note: String(task.note || "").slice(0, 400),
      slot: task.slot === "after" ? "after" : "before",
    };
  }

  if (task.kind === "file" && task.file?.buffer) {
    return {
      kind: "file",
      file: task.file,
      autoCaptured: Boolean(task.autoCaptured),
      note: String(task.note || "").slice(0, 400),
      slot: task.slot === "after" ? "after" : "before",
    };
  }

  return null;
};

const resolveSlotResult = async (slotTask) => {
  if (!slotTask) {
    return {
      provider: "",
      path: "",
      slot: "before",
      note: "",
      autoCaptured: false,
    };
  }

  if (slotTask.kind === "url") {
    return {
      provider: "external-url",
      path: slotTask.url,
      slot: slotTask.slot,
      note: slotTask.note,
      autoCaptured: slotTask.autoCaptured,
    };
  }

  const stored = await storeScreenshot(slotTask.file);
  return {
    provider: stored.provider || "",
    path: stored.path || "",
    slot: slotTask.slot,
    note: slotTask.note,
    autoCaptured: slotTask.autoCaptured,
  };
};

const markTradeMediaStatus = async ({ tradeId, status, pendingItems = [], lastError = "" }) => {
  await Trade.updateOne(
    { _id: tradeId },
    {
      $set: {
        "mediaProcessing.status": status,
        "mediaProcessing.pendingItems": pendingItems,
        "mediaProcessing.lastError": String(lastError || "").slice(0, 400),
        "mediaProcessing.updatedAt": new Date(),
      },
    }
  );
};

const applyMediaTask = async (task) => {
  const trade = await Trade.findById(task.tradeId);
  if (!trade) {
    return;
  }

  const pendingItems = [];
  if (task.beforeTask) {
    pendingItems.push("before");
  }
  if (task.afterTask) {
    pendingItems.push("after");
  }

  await markTradeMediaStatus({
    tradeId: task.tradeId,
    status: pendingItems.length ? "processing" : "ready",
    pendingItems,
    lastError: "",
  });

  const [beforeResult, afterResult] = await Promise.all([
    resolveSlotResult(task.beforeTask),
    resolveSlotResult(task.afterTask),
  ]);

  trade.screenshots = trade.screenshots || {};
  trade.automation = trade.automation || {};

  [beforeResult, afterResult].forEach((result) => {
    if (!result.path) {
      return;
    }

    if (result.slot === "before") {
      trade.screenshots.before = result.path;
      if (result.note) {
        trade.screenshots.beforeNote = result.note;
      }
      trade.automation.autoCapturedBefore = Boolean(trade.automation.autoCapturedBefore || result.autoCaptured);
      if (result.autoCaptured) {
        trade.automation.entryCapturedAt = trade.automation.entryCapturedAt || new Date();
      }
      return;
    }

    trade.screenshots.after = result.path;
    if (result.note) {
      trade.screenshots.afterNote = result.note;
    }
    trade.automation.autoCapturedAfter = Boolean(trade.automation.autoCapturedAfter || result.autoCaptured);
    if (result.autoCaptured) {
      trade.automation.exitCapturedAt = trade.automation.exitCapturedAt || new Date();
    }
  });

  trade.storageProvider = mergeProviders(
    trade.storageProvider,
    beforeResult.provider,
    afterResult.provider
  );
  trade.mediaProcessing = {
    ...(trade.mediaProcessing || {}),
    status: "ready",
    pendingItems: [],
    lastError: "",
    updatedAt: new Date(),
    queuedAt: trade.mediaProcessing?.queuedAt || new Date(),
  };
  await trade.save();
};

const runWorker = async () => {
  if (workerRunning) {
    return;
  }
  workerRunning = true;

  while (queue.length) {
    const next = queue.shift();
    if (!next) {
      continue;
    }

    try {
      await applyMediaTask(next);
      logInfo("media.queue.processed", {
        tradeId: String(next.tradeId),
        source: next.source || "",
      });
    } catch (error) {
      logError("media.queue.failed", {
        tradeId: String(next.tradeId),
        message: error.message,
      });
      await markTradeMediaStatus({
        tradeId: next.tradeId,
        status: "error",
        pendingItems: [],
        lastError: error.message,
      });
    }
  }

  workerRunning = false;
};

export const enqueueTradeMediaProcessing = async ({
  tradeId,
  source = "",
  beforeTask = null,
  afterTask = null,
}) => {
  const normalizedBefore = ensureSlotTask(beforeTask);
  const normalizedAfter = ensureSlotTask(afterTask);

  if (!normalizedBefore && !normalizedAfter) {
    return false;
  }

  const pendingItems = [];
  if (normalizedBefore) {
    pendingItems.push("before");
  }
  if (normalizedAfter) {
    pendingItems.push("after");
  }

  await Trade.updateOne(
    { _id: tradeId },
    {
      $set: {
        "mediaProcessing.status": "queued",
        "mediaProcessing.pendingItems": pendingItems,
        "mediaProcessing.lastError": "",
        "mediaProcessing.queuedAt": new Date(),
        "mediaProcessing.updatedAt": new Date(),
      },
    }
  );

  queue.push({
    tradeId,
    source,
    beforeTask: normalizedBefore,
    afterTask: normalizedAfter,
  });

  void runWorker();
  return true;
};

