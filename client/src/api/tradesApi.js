const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const AUTH_STORAGE_KEY = "trading-journal-token";
export const AUTH_REFRESH_STORAGE_KEY = "trading-journal-refresh-token";
const OFFLINE_QUEUE_KEY = "trading-journal-offline-queue";
const OFFLINE_SNAPSHOT_KEY = "trading-journal-offline-snapshot";
const OFFLINE_FILES_DB = "trading-journal-offline-files";
const OFFLINE_FILES_STORE = "attachments";

let offlineDbPromise = null;
let refreshPromise = null;

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

const readStorage = (key) => localStorage.getItem(key) || "";

const writeStorage = (key, value) => {
  if (!value) {
    localStorage.removeItem(key);
    return;
  }
  localStorage.setItem(key, String(value));
};

export const readStoredAuthSession = () => ({
  token: readStorage(AUTH_STORAGE_KEY),
  refreshToken: readStorage(AUTH_REFRESH_STORAGE_KEY),
});

export const persistAuthSession = ({ token = "", refreshToken = "" } = {}) => {
  writeStorage(AUTH_STORAGE_KEY, token);
  writeStorage(AUTH_REFRESH_STORAGE_KEY, refreshToken);
};

export const clearAuthSession = () => {
  localStorage.removeItem(AUTH_STORAGE_KEY);
  localStorage.removeItem(AUTH_REFRESH_STORAGE_KEY);
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

const retryDelayMs = (attempts) => {
  const normalized = Math.max(Number(attempts) || 1, 1);
  const step = Math.min(normalized - 1, 5);
  return Math.min(15000 * 2 ** step, 5 * 60 * 1000);
};

const attachmentKey = (queueId, slot) => `${queueId}:${slot}`;

const waitForTransaction = (transaction) =>
  new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onerror = () => reject(transaction.error || new Error("Offline storage transaction failed."));
    transaction.onabort = () => reject(transaction.error || new Error("Offline storage transaction aborted."));
  });

const requestResult = (request) =>
  new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("Offline storage request failed."));
  });

const openOfflineFilesDb = async () => {
  if (typeof indexedDB === "undefined") {
    return null;
  }

  if (!offlineDbPromise) {
    offlineDbPromise = new Promise((resolve) => {
      const request = indexedDB.open(OFFLINE_FILES_DB, 1);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(OFFLINE_FILES_STORE)) {
          db.createObjectStore(OFFLINE_FILES_STORE, { keyPath: "id" });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
      request.onblocked = () => resolve(null);
    });
  }

  return offlineDbPromise;
};

const saveOfflineAttachment = async (queueId, slot, file) => {
  if (!file) {
    return;
  }

  const db = await openOfflineFilesDb();
  if (!db) {
    return;
  }

  const transaction = db.transaction(OFFLINE_FILES_STORE, "readwrite");
  const store = transaction.objectStore(OFFLINE_FILES_STORE);

  store.put({
    id: attachmentKey(queueId, slot),
    blob: file,
    name: file.name || `${slot}.png`,
    mimeType: file.type || "application/octet-stream",
    updatedAt: new Date().toISOString(),
  });

  await waitForTransaction(transaction);
};

const readOfflineAttachment = async (queueId, slot) => {
  const db = await openOfflineFilesDb();
  if (!db) {
    return null;
  }

  const transaction = db.transaction(OFFLINE_FILES_STORE, "readonly");
  const store = transaction.objectStore(OFFLINE_FILES_STORE);
  const record = await requestResult(store.get(attachmentKey(queueId, slot)));
  await waitForTransaction(transaction);
  return record || null;
};

const deleteOfflineAttachments = async (queueId) => {
  const db = await openOfflineFilesDb();
  if (!db) {
    return;
  }

  const transaction = db.transaction(OFFLINE_FILES_STORE, "readwrite");
  const store = transaction.objectStore(OFFLINE_FILES_STORE);
  store.delete(attachmentKey(queueId, "before"));
  store.delete(attachmentKey(queueId, "after"));
  await waitForTransaction(transaction);
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

const resolveAccessToken = (token) => token || readStorage(AUTH_STORAGE_KEY);

const refreshAccessToken = async () => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshToken = readStorage(AUTH_REFRESH_STORAGE_KEY);
    if (!refreshToken) {
      return "";
    }

    try {
      const response = await fetchWithDiagnostics(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ refreshToken }),
      });
      const payload = await parseResponse(response);
      persistAuthSession({
        token: payload.token,
        refreshToken: payload.refreshToken || refreshToken,
      });
      return payload.token || "";
    } catch {
      clearAuthSession();
      return "";
    } finally {
      refreshPromise = null;
    }
  })();

  return refreshPromise;
};

const fetchWithAuthRetry = async (url, options = {}, token = "") => {
  const initialToken = resolveAccessToken(token);
  const attempt = await fetchWithDiagnostics(url, {
    ...options,
    headers: withAuth(initialToken, options.headers || {}),
  });

  if (attempt.status !== 401) {
    return attempt;
  }

  const refreshedToken = await refreshAccessToken();
  if (!refreshedToken) {
    return attempt;
  }

  return fetchWithDiagnostics(url, {
    ...options,
    headers: withAuth(refreshedToken, options.headers || {}),
  });
};

export const registerUser = async ({ name, email, password }) => {
  const response = await fetchWithDiagnostics(`${API_BASE}/api/auth/register`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ name, email, password }),
  });
  const payload = await parseResponse(response);
  persistAuthSession({
    token: payload.token,
    refreshToken: payload.refreshToken,
  });
  return payload;
};

export const loginUser = async ({ email, password }) => {
  const response = await fetchWithDiagnostics(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  const payload = await parseResponse(response);
  persistAuthSession({
    token: payload.token,
    refreshToken: payload.refreshToken,
  });
  return payload;
};

export const fetchMe = async (token) => {
  const response = await fetchWithAuthRetry(`${API_BASE}/api/auth/me`, {}, token);
  return parseResponse(response);
};

export const updateUserSettings = async (token, settingsPayload) => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/auth/settings`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(settingsPayload),
    },
    token
  );
  return parseResponse(response);
};

export const createProfile = async (token, profilePayload) => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/auth/profiles`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(profilePayload),
    },
    token
  );
  return parseResponse(response);
};

export const setActiveProfile = async (token, profileId) => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/auth/profiles/active`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ profileId }),
    },
    token
  );

  const payload = await parseResponse(response);
  persistAuthSession({
    token: payload.token || token,
    refreshToken: readStorage(AUTH_REFRESH_STORAGE_KEY),
  });
  return payload;
};

export const logoutSession = async ({ token, refreshToken, allSessions = false } = {}) => {
  if (allSessions && token) {
    const response = await fetchWithAuthRetry(
      `${API_BASE}/api/auth/logout`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ allSessions: true }),
      },
      token
    );
    clearAuthSession();
    return parseResponse(response);
  }

  const response = await fetchWithDiagnostics(`${API_BASE}/api/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      refreshToken: refreshToken || readStorage(AUTH_REFRESH_STORAGE_KEY),
      allSessions: false,
    }),
  });
  clearAuthSession();
  return parseResponse(response);
};

export const fetchTrades = async (filters, token) => {
  const response = await fetchWithAuthRetry(`${API_BASE}/api/trades${queryString(filters)}`, {}, token);
  return parseResponse(response);
};

export const fetchAnalytics = async (filters, token) => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/trades/analytics${queryString(filters)}`,
    {},
    token
  );
  return parseResponse(response);
};

export const fetchWeeklyReview = async (filters, token) => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/trades/review/weekly${queryString(filters)}`,
    {},
    token
  );
  return parseResponse(response);
};

export const createTrade = async (tradeFormData, token) => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/trades`,
    {
      method: "POST",
      body: tradeFormData,
    },
    token
  );
  return parseResponse(response);
};

export const exportTradesCsv = async (filters, token) => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/trades/export.csv${queryString(filters)}`,
    {},
    token
  );
  return parseResponse(response, { asBlob: true });
};

export const importTradesCsv = async (file, token) => {
  const data = new FormData();
  data.append("file", file);

  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/trades/import.csv`,
    {
      method: "POST",
      body: data,
    },
    token
  );
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
    profileId: String(draft.profileId || "").trim(),
    clientTradeId: String(draft.clientTradeId || "").trim(),
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
    screenshotBeforeName: String(draft.screenshotBeforeName || draft.screenshotBeforeFile?.name || "").trim(),
    screenshotAfterName: String(draft.screenshotAfterName || draft.screenshotAfterFile?.name || "").trim(),
    screenshotBeforeNote: String(draft.screenshotBeforeNote || "").trim(),
    screenshotAfterNote: String(draft.screenshotAfterNote || "").trim(),
  };
};

const buildOfflineDisplayTrade = (id, payload, queuedAt) => ({
  _id: id,
  profileId: payload.profileId,
  clientTradeId: payload.clientTradeId,
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
    beforeNote: payload.screenshotBeforeNote,
    afterNote: payload.screenshotAfterNote,
  },
  isOfflinePending: true,
  queuedAt,
  offlineMeta: {
    screenshotBeforeName: payload.screenshotBeforeName,
    screenshotAfterName: payload.screenshotAfterName,
    screenshotBeforeNote: payload.screenshotBeforeNote,
    screenshotAfterNote: payload.screenshotAfterNote,
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

export const queueTradeOffline = async (draft = {}) => {
  const payload = normalizeQueuedDraft(draft);
  const queuedAt = new Date().toISOString();
  const id = `offline-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const queuedItem = {
    id,
    queuedAt,
    attempts: 0,
    lastError: "",
    nextRetryAt: "",
    payload,
    displayTrade: buildOfflineDisplayTrade(id, payload, queuedAt),
  };

  const queue = getOfflineQueue();
  writeOfflineQueue([queuedItem, ...queue]);

  try {
    await Promise.all([
      saveOfflineAttachment(id, "before", draft.screenshotBeforeFile),
      saveOfflineAttachment(id, "after", draft.screenshotAfterFile),
    ]);
  } catch {
    // Keep the queue item even if offline attachment storage is unavailable.
  }

  return queuedItem;
};

export const clearOfflineQueue = async () => {
  const queue = getOfflineQueue();
  writeOfflineQueue([]);

  await Promise.all(
    queue.map(async (item) => {
      try {
        await deleteOfflineAttachments(item.id);
      } catch {
        // Ignore cleanup errors to avoid blocking queue clear.
      }
    })
  );

  return {
    cleared: queue.length,
  };
};

const buildQueuedFormData = (payload = {}) => {
  const data = new FormData();
  const fields = [
    "profileId",
    "clientTradeId",
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
    "screenshotBeforeNote",
    "screenshotAfterNote",
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
  const now = Date.now();

  for (let index = 0; index < ordered.length; index += 1) {
    const item = ordered[index];
    const retryAt = item.nextRetryAt ? new Date(item.nextRetryAt).getTime() : 0;
    if (retryAt && retryAt > now) {
      nextQueue.push(item);
      continue;
    }

    try {
      const payload = buildQueuedFormData(item.payload);
      const [beforeAttachment, afterAttachment] = await Promise.all([
        readOfflineAttachment(item.id, "before"),
        readOfflineAttachment(item.id, "after"),
      ]);

      if (beforeAttachment?.blob) {
        payload.append(
          "screenshotBefore",
          beforeAttachment.blob,
          beforeAttachment.name || item.payload?.screenshotBeforeName || "before.png"
        );
      }

      if (afterAttachment?.blob) {
        payload.append(
          "screenshotAfter",
          afterAttachment.blob,
          afterAttachment.name || item.payload?.screenshotAfterName || "after.png"
        );
      }

      await createTrade(payload, token);
      await deleteOfflineAttachments(item.id);
      synced += 1;
    } catch (error) {
      const attempts = (item.attempts || 0) + 1;
      const backoffUntil = new Date(Date.now() + retryDelayMs(attempts)).toISOString();

      if (isNetworkError(error)) {
        nextQueue.push(
          {
            ...item,
            attempts,
            lastError: error.message,
            nextRetryAt: backoffUntil,
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
        attempts,
        lastError: error.message || "Sync failed",
        nextRetryAt: backoffUntil,
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
