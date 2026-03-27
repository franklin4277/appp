const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const AUTH_STORAGE_KEY = "trading-journal-token";
const OFFLINE_QUEUE_KEY = "trading-journal-offline-queue";
const OFFLINE_SNAPSHOT_KEY = "trading-journal-offline-snapshot";

const readJsonStorage = (key, fallback) => {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) {
      return fallback;
    }
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
};

const writeJsonStorage = (key, value) => {
  localStorage.setItem(key, JSON.stringify(value));
};

const toNumber = (value, fallback = 0) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
};

const toIsoDate = (value) => {
  const date = value ? new Date(value) : new Date();
  if (Number.isNaN(date.getTime())) {
    return new Date().toISOString();
  }
  return date.toISOString();
};

const queryString = (params = {}) => {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value === undefined || value === null || value === "" || value === false) {
      return;
    }
    search.set(key, String(value));
  });
  return search.toString() ? `?${search.toString()}` : "";
};

const parseResponse = async (response, { asBlob = false } = {}) => {
  if (asBlob) {
    if (!response.ok) {
      const payload = await response.json().catch(() => ({}));
      const error = new Error(payload.message || "Request failed");
      error.status = response.status;
      error.code = payload.code;
      error.payload = payload;
      throw error;
    }
    return response.blob();
  }

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const error = new Error(payload.message || "Request failed");
    error.status = response.status;
    error.code = payload.code;
    error.payload = payload;
    throw error;
  }
  return payload;
};

export const isNetworkError = (error) =>
  Boolean(error?.isNetworkError || error?.code === "NETWORK_UNREACHABLE");

const fetchWithDiagnostics = async (url, options = {}) => {
  try {
    return await fetch(url, options);
  } catch (error) {
    const networkError = new Error(
      "Cannot reach the server. Check backend URL, CORS CLIENT_URL, and that /api/health is online."
    );
    networkError.code = "NETWORK_UNREACHABLE";
    networkError.isNetworkError = true;
    networkError.cause = error;
    throw networkError;
  }
};

const withAuth = (token, headers = {}) => {
  if (!token) {
    return headers;
  }
  return {
    ...headers,
    Authorization: `Bearer ${token}`,
  };
};

export const registerUser = async ({ name, email, password }) => {
  const response = await fetchWithDiagnostics(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, email, password }),
  });
  return parseResponse(response);
};

export const loginUser = async ({ email, password }) => {
  const response = await fetchWithDiagnostics(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  return parseResponse(response);
};

export const fetchMe = async (token) => {
  const response = await fetchWithDiagnostics(`${API_BASE}/api/auth/me`, {
    headers: withAuth(token),
  });
  return parseResponse(response);
};

export const updateUserSettings = async (token, settingsPayload) => {
  const response = await fetchWithDiagnostics(`${API_BASE}/api/auth/settings`, {
    method: "PATCH",
    headers: withAuth(token, {
      "Content-Type": "application/json",
    }),
    body: JSON.stringify(settingsPayload),
  });
  return parseResponse(response);
};

export const fetchTrades = async (filters, token) => {
  const response = await fetchWithDiagnostics(`${API_BASE}/api/trades${queryString(filters)}`, {
    headers: withAuth(token),
  });
  return parseResponse(response);
};

export const fetchAnalytics = async (filters, token) => {
  const response = await fetchWithDiagnostics(`${API_BASE}/api/trades/analytics${queryString(filters)}`, {
    headers: withAuth(token),
  });
  return parseResponse(response);
};

export const createTrade = async (tradeFormData, token) => {
  const response = await fetchWithDiagnostics(`${API_BASE}/api/trades`, {
    method: "POST",
    headers: withAuth(token),
    body: tradeFormData,
  });
  return parseResponse(response);
};

export const exportTradesCsv = async (filters, token) => {
  const response = await fetchWithDiagnostics(`${API_BASE}/api/trades/export.csv${queryString(filters)}`, {
    headers: withAuth(token),
  });
  return parseResponse(response, { asBlob: true });
};

export const importTradesCsv = async (file, token) => {
  const data = new FormData();
  data.append("file", file);

  const response = await fetchWithDiagnostics(`${API_BASE}/api/trades/import.csv`, {
    method: "POST",
    headers: withAuth(token),
    body: data,
  });
  return parseResponse(response);
};

export const saveOfflineSnapshot = ({ trades = [], analytics = null, filters = {} }) => {
  const snapshot = {
    trades,
    analytics,
    filters,
    updatedAt: new Date().toISOString(),
  };
  writeJsonStorage(OFFLINE_SNAPSHOT_KEY, snapshot);
  return snapshot;
};

export const readOfflineSnapshot = () => readJsonStorage(OFFLINE_SNAPSHOT_KEY, null);

const normalizeQueuedDraft = (draft = {}) => {
  const pair = String(draft.pair || "").trim().toUpperCase();
  return {
    pair,
    tradeDate: toIsoDate(draft.tradeDate),
    session: String(draft.session || "").trim(),
    tradeType: String(draft.tradeType || "").trim(),
    setupType: String(draft.setupType || "").trim(),
    entryPrice: String(toNumber(draft.entryPrice)),
    stopLoss: String(toNumber(draft.stopLoss)),
    takeProfit: String(toNumber(draft.takeProfit)),
    riskPercent: String(toNumber(draft.riskPercent)),
    lotSize: draft.lotSize === undefined || draft.lotSize === null ? "" : String(draft.lotSize),
    result: String(draft.result || "BE").trim(),
    rrAchieved: String(toNumber(draft.rrAchieved)),
    asiaHighLowUsed: String(Boolean(draft.asiaHighLowUsed)),
    pocInteraction: String(Boolean(draft.pocInteraction)),
    pocOutcome: String(draft.pocOutcome || "").trim(),
    cleanSetup: String(Boolean(draft.cleanSetup)),
    ruleBreakReason: String(draft.ruleBreakReason || "").trim(),
    priceAction: String(draft.priceAction || "").trim(),
    executionReview: String(draft.executionReview || "").trim(),
    emotionalState: String(draft.emotionalState || "").trim(),
    acceptGuardrailOverride: "true",
    screenshotBeforeName: String(draft.screenshotBeforeName || "").trim(),
    screenshotAfterName: String(draft.screenshotAfterName || "").trim(),
  };
};

const buildOfflineDisplayTrade = (id, payload, queuedAt) => ({
  _id: id,
  pair: payload.pair,
  tradeDate: payload.tradeDate,
  session: payload.session,
  tradeType: payload.tradeType,
  setupType: payload.setupType,
  entryPrice: toNumber(payload.entryPrice),
  stopLoss: toNumber(payload.stopLoss),
  takeProfit: toNumber(payload.takeProfit),
  riskPercent: toNumber(payload.riskPercent),
  lotSize: payload.lotSize === "" ? null : toNumber(payload.lotSize, null),
  result: payload.result,
  rrAchieved: toNumber(payload.rrAchieved),
  tags: {
    asiaHighLowUsed: payload.asiaHighLowUsed === "true",
    pocInteraction: payload.pocInteraction === "true",
    pocOutcome: payload.pocOutcome,
    cleanSetup: payload.cleanSetup === "true",
  },
  notes: {
    priceAction: payload.priceAction,
    executionReview: payload.executionReview,
    emotionalState: payload.emotionalState,
  },
  ruleBreakReason: payload.ruleBreakReason,
  screenshots: {
    before: "",
    after: "",
  },
  isOfflinePending: true,
  queuedAt,
  offlineMeta: {
    screenshotBeforeName: payload.screenshotBeforeName,
    screenshotAfterName: payload.screenshotAfterName,
  },
});

export const getOfflineQueue = () => {
  const queue = readJsonStorage(OFFLINE_QUEUE_KEY, []);
  if (!Array.isArray(queue)) {
    return [];
  }
  return queue.filter((item) => item?.id && item?.payload);
};

const writeOfflineQueue = (items = []) => {
  writeJsonStorage(OFFLINE_QUEUE_KEY, items);
};

export const queueTradeOffline = (draft = {}) => {
  const payload = normalizeQueuedDraft(draft);
  const queuedAt = new Date().toISOString();
  const id = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const queuedItem = {
    id,
    queuedAt,
    attempts: 0,
    lastError: "",
    payload,
    displayTrade: buildOfflineDisplayTrade(id, payload, queuedAt),
  };

  const queue = getOfflineQueue();
  writeOfflineQueue([queuedItem, ...queue]);
  return queuedItem;
};

const buildQueuedFormData = (payload = {}) => {
  const data = new FormData();
  const fields = [
    "pair",
    "tradeDate",
    "session",
    "tradeType",
    "setupType",
    "entryPrice",
    "stopLoss",
    "takeProfit",
    "riskPercent",
    "lotSize",
    "result",
    "rrAchieved",
    "asiaHighLowUsed",
    "pocInteraction",
    "pocOutcome",
    "cleanSetup",
    "ruleBreakReason",
    "priceAction",
    "executionReview",
    "emotionalState",
    "acceptGuardrailOverride",
  ];

  fields.forEach((field) => {
    if (payload[field] === undefined || payload[field] === null) {
      return;
    }
    data.append(field, String(payload[field]));
  });

  return data;
};

export const syncOfflineQueue = async (token) => {
  const queue = getOfflineQueue();
  if (!queue.length) {
    return {
      synced: 0,
      failed: 0,
      pending: 0,
      errors: [],
    };
  }

  const ordered = [...queue].sort((a, b) => new Date(a.queuedAt).getTime() - new Date(b.queuedAt).getTime());
  const nextQueue = [];
  const errors = [];
  let synced = 0;
  let failed = 0;

  for (let index = 0; index < ordered.length; index += 1) {
    const item = ordered[index];
    try {
      const payload = buildQueuedFormData(item.payload);
      await createTrade(payload, token);
      synced += 1;
    } catch (error) {
      if (isNetworkError(error)) {
        nextQueue.push(
          {
            ...item,
            attempts: (item.attempts || 0) + 1,
            lastError: error.message,
          },
          ...ordered.slice(index + 1)
        );
        break;
      }

      failed += 1;
      errors.push({
        id: item.id,
        message: error.message || "Sync failed",
      });
      nextQueue.push({
        ...item,
        attempts: (item.attempts || 0) + 1,
        lastError: error.message || "Sync failed",
      });
    }
  }

  writeOfflineQueue(nextQueue.sort((a, b) => new Date(b.queuedAt).getTime() - new Date(a.queuedAt).getTime()));

  return {
    synced,
    failed,
    pending: nextQueue.length,
    errors,
  };
};
