import Trade from "../models/Trade.js";
import AnalyticsSnapshot from "../models/AnalyticsSnapshot.js";
import { resolveDefaultProfileId } from "./auth.js";
import { buildDashboardAnalytics } from "./analytics.js";
import { logError, logInfo } from "./logger.js";

const REBUILD_DEBOUNCE_MS = 200;
const SNAPSHOT_MEMORY_TTL_MS = Math.max(Number(process.env.ANALYTICS_CACHE_TTL_MS || 30_000), 2_000);
const SNAPSHOT_MEMORY_MAX_ENTRIES = Math.max(Number(process.env.ANALYTICS_CACHE_MAX || 140), 20);
const pendingRebuildJobs = new Map();
const memorySnapshotCache = new Map();

const ensureText = (value = "") => String(value || "").trim();

const escapeRegex = (value = "") => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

export const normalizeAnalyticsFilter = (input = {}) => ({
  pair: ensureText(input.pair).toLowerCase(),
  session: ensureText(input.session).toLowerCase(),
  setupType: ensureText(input.setupType).toLowerCase(),
  cleanOnly: input.cleanOnly === true || String(input.cleanOnly || "").toLowerCase() === "true",
});

export const isDefaultAnalyticsFilter = (filter = {}) =>
  !filter.pair && !filter.session && !filter.setupType && !filter.cleanOnly;

export const scopeKeyFromFilter = (filter = {}) => {
  if (isDefaultAnalyticsFilter(filter)) {
    return "all";
  }
  return [
    `pair:${filter.pair || "*"}`,
    `session:${filter.session || "*"}`,
    `setup:${filter.setupType || "*"}`,
    `clean:${filter.cleanOnly ? "1" : "0"}`,
  ].join("|");
};

const memoryCacheKeyFor = ({ userId, profileId, scopeKey }) =>
  `${String(userId)}:${String(profileId)}:${String(scopeKey || "all")}`;

const pruneMemorySnapshotCache = () => {
  if (memorySnapshotCache.size <= SNAPSHOT_MEMORY_MAX_ENTRIES) {
    return;
  }

  const toDelete = [...memorySnapshotCache.entries()]
    .sort((a, b) => (a[1]?.touchedAt || 0) - (b[1]?.touchedAt || 0))
    .slice(0, memorySnapshotCache.size - SNAPSHOT_MEMORY_MAX_ENTRIES)
    .map(([key]) => key);

  toDelete.forEach((key) => memorySnapshotCache.delete(key));
};

const readMemorySnapshotCache = (cacheKey) => {
  const entry = memorySnapshotCache.get(cacheKey);
  if (!entry) {
    return null;
  }

  if (!entry.expiresAt || entry.expiresAt <= Date.now()) {
    memorySnapshotCache.delete(cacheKey);
    return null;
  }

  entry.touchedAt = Date.now();
  return entry.analytics || null;
};

const writeMemorySnapshotCache = (cacheKey, analytics) => {
  memorySnapshotCache.set(cacheKey, {
    analytics,
    expiresAt: Date.now() + SNAPSHOT_MEMORY_TTL_MS,
    touchedAt: Date.now(),
  });
  pruneMemorySnapshotCache();
};

const clearMemorySnapshotsForProfile = ({ userId, profileId }) => {
  const keyPrefix = `${String(userId)}:${String(profileId)}:`;
  [...memorySnapshotCache.keys()].forEach((key) => {
    if (key.startsWith(keyPrefix)) {
      memorySnapshotCache.delete(key);
    }
  });
};

const applyProfileScopeFilter = ({ filter = {}, user, profileId }) => {
  const next = { ...filter };
  const defaultProfileId = resolveDefaultProfileId(user);

  if (profileId === defaultProfileId) {
    next.$or = [{ profileId }, { profileId: { $exists: false } }, { profileId: null }];
  } else {
    next.profileId = profileId;
  }

  return next;
};

const buildTradeFilter = ({ user, profileId, filter = {} }) => {
  const base = applyProfileScopeFilter({
    filter: {
      userId: user._id,
    },
    user,
    profileId,
  });

  if (filter.pair) {
    base.pair = { $regex: escapeRegex(filter.pair), $options: "i" };
  }
  if (filter.session) {
    base.session = { $regex: escapeRegex(filter.session), $options: "i" };
  }
  if (filter.setupType) {
    base.setupType = { $regex: escapeRegex(filter.setupType), $options: "i" };
  }
  if (filter.cleanOnly) {
    base["tags.cleanSetup"] = true;
  }

  return base;
};

const analyticsProjection = {
  _id: 1,
  tradeDate: 1,
  result: 1,
  rrAchieved: 1,
  setupType: 1,
  session: 1,
  tags: 1,
  ruleBreakReason: 1,
  notes: 1,
};

const buildAnalyticsPayload = async ({ user, profileId, filter }) => {
  const tradeFilter = buildTradeFilter({
    user,
    profileId,
    filter,
  });
  const trades = await Trade.find(tradeFilter, analyticsProjection).lean();
  return {
    totalTrades: trades.length,
    analytics: buildDashboardAnalytics(trades),
  };
};

export const getOrBuildAnalyticsSnapshot = async ({ user, profileId, filterInput = {}, forceRebuild = false }) => {
  const filter = normalizeAnalyticsFilter(filterInput);
  const scopeKey = scopeKeyFromFilter(filter);
  const cacheKey = memoryCacheKeyFor({
    userId: user._id,
    profileId,
    scopeKey,
  });

  if (!forceRebuild) {
    const memoryCached = readMemorySnapshotCache(cacheKey);
    if (memoryCached) {
      return memoryCached;
    }

    const existing = await AnalyticsSnapshot.findOne({
      userId: user._id,
      profileId,
      scopeKey,
    }).lean();

    if (existing?.analytics) {
      writeMemorySnapshotCache(cacheKey, existing.analytics);
      return existing.analytics;
    }
  }

  const built = await buildAnalyticsPayload({
    user,
    profileId,
    filter,
  });

  await AnalyticsSnapshot.updateOne(
    {
      userId: user._id,
      profileId,
      scopeKey,
    },
    {
      $set: {
        filter,
        totalTrades: built.totalTrades,
        analytics: built.analytics,
        generatedAt: new Date(),
      },
    },
    {
      upsert: true,
    }
  );

  writeMemorySnapshotCache(cacheKey, built.analytics);
  return built.analytics;
};

export const invalidateAnalyticsSnapshots = async ({ userId, profileId }) => {
  clearMemorySnapshotsForProfile({
    userId,
    profileId,
  });
  await AnalyticsSnapshot.deleteMany({
    userId,
    profileId,
  });
};

export const scheduleDefaultAnalyticsSnapshotRebuild = ({ user, profileId }) => {
  const key = `${String(user._id)}:${profileId}`;
  if (pendingRebuildJobs.has(key)) {
    return;
  }

  const timeoutId = setTimeout(async () => {
    pendingRebuildJobs.delete(key);
    try {
      await invalidateAnalyticsSnapshots({
        userId: user._id,
        profileId,
      });
      await getOrBuildAnalyticsSnapshot({
        user,
        profileId,
        filterInput: {},
        forceRebuild: true,
      });
      logInfo("analytics.snapshot.rebuilt", {
        userId: String(user._id),
        profileId,
      });
    } catch (error) {
      logError("analytics.snapshot.rebuild_failed", {
        userId: String(user._id),
        profileId,
        message: error.message,
      });
    }
  }, REBUILD_DEBOUNCE_MS);

  pendingRebuildJobs.set(key, timeoutId);
};
