const normalizeApiBase = (value = "") => {
  let normalized = String(value || "").trim().replace(/\/+$/, "");
  if (/\/api$/i.test(normalized)) {
    normalized = normalized.replace(/\/api$/i, "");
  }
  return normalized;
};

const API_BASE = normalizeApiBase(import.meta.env.VITE_API_URL || "");
const API_TIMEOUT_MS = Math.max(5000, Number(import.meta.env.VITE_API_TIMEOUT_MS || 60000) || 60000);
export const AUTH_STORAGE_KEY = "trading-journal-token";
export const AUTH_REFRESH_STORAGE_KEY = "trading-journal-refresh-token";
const AUTH_PROFILE_CACHE_KEY = "trading-journal-user-cache";
const LOCAL_DEVICE_ID_KEY = "trading-journal-local-device-id";
const TRUSTED_DEVICE_META_KEY = "trading-journal-trusted-device-meta";
const OFFLINE_QUEUE_KEY = "trading-journal-offline-queue";
const OFFLINE_SNAPSHOT_KEY = "trading-journal-offline-snapshot";
const OFFLINE_FILES_DB = "trading-journal-offline-files";
const OFFLINE_FILES_STORE = "attachments";
const STORAGE_SCHEMA_VERSION = 2;
const TRUSTED_DEVICE_ITERATIONS = 140000;

let offlineDbPromise = null;
let refreshPromise = null;
let trustedDeviceSessionPin = "";

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

const randomToken = () => {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

export const ensureLocalDeviceId = () => {
  const existing = readStorage(LOCAL_DEVICE_ID_KEY);
  if (existing) {
    return existing;
  }
  const next = `device-${randomToken()}`;
  writeStorage(LOCAL_DEVICE_ID_KEY, next);
  return next;
};

export const readCachedAuthProfile = async () => {
  const raw = readJsonStorage(AUTH_PROFILE_CACHE_KEY, null);
  if (!raw || typeof raw !== "object") {
    return null;
  }

  // Legacy v1 cache shape: { user, savedAt, deviceId }
  if (raw.user && typeof raw.user === "object" && !raw.encrypted) {
    return {
      version: 1,
      user: raw.user,
      savedAt: String(raw.savedAt || ""),
      deviceId: String(raw.deviceId || ""),
      encrypted: false,
      locked: false,
    };
  }

  if (!raw.encrypted) {
    return null;
  }

  const meta = getTrustedMeta();
  if (!meta || !trustedDeviceSessionPin) {
    return {
      version: Number(raw.version || STORAGE_SCHEMA_VERSION),
      encrypted: true,
      locked: true,
      savedAt: String(raw.savedAt || ""),
      deviceId: String(raw.deviceId || ""),
    };
  }

  try {
    const payload = await decryptWithPin(
      {
        iv: String(raw.iv || ""),
        ciphertext: String(raw.ciphertext || ""),
      },
      trustedDeviceSessionPin,
      meta
    );

    return {
      version: Number(raw.version || STORAGE_SCHEMA_VERSION),
      user: payload?.user || null,
      savedAt: String(raw.savedAt || ""),
      deviceId: String(raw.deviceId || ""),
      encrypted: true,
      locked: false,
    };
  } catch {
    return {
      version: Number(raw.version || STORAGE_SCHEMA_VERSION),
      encrypted: true,
      locked: true,
      savedAt: String(raw.savedAt || ""),
      deviceId: String(raw.deviceId || ""),
    };
  }
};

export const persistCachedAuthProfile = async (user) => {
  if (!user || typeof user !== "object") {
    return;
  }

  const savedAt = new Date().toISOString();
  const deviceId = ensureLocalDeviceId();
  const trustedMeta = getTrustedMeta();

  if (!trustedMeta) {
    writeJsonStorage(AUTH_PROFILE_CACHE_KEY, {
      version: STORAGE_SCHEMA_VERSION,
      user,
      savedAt,
      deviceId,
      encrypted: false,
    });
    return;
  }

  if (!trustedDeviceSessionPin) {
    // Do not overwrite encrypted cache if trusted mode is enabled but locked.
    return;
  }

  const encrypted = await encryptWithPin({ user }, trustedDeviceSessionPin, trustedMeta);
  writeJsonStorage(AUTH_PROFILE_CACHE_KEY, {
    version: STORAGE_SCHEMA_VERSION,
    encrypted: true,
    savedAt,
    deviceId,
    iv: encrypted.iv,
    ciphertext: encrypted.ciphertext,
  });
};

export const clearCachedAuthProfile = () => {
  localStorage.removeItem(AUTH_PROFILE_CACHE_KEY);
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const toBase64 = (value) => {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  bytes.forEach((item) => {
    binary += String.fromCharCode(item);
  });
  return btoa(binary);
};

const fromBase64 = (value = "") => {
  const binary = atob(String(value || ""));
  const output = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    output[index] = binary.charCodeAt(index);
  }
  return output;
};

const getTrustedMeta = () => {
  const raw = readJsonStorage(TRUSTED_DEVICE_META_KEY, null);
  if (!raw || typeof raw !== "object") {
    return null;
  }
  if (!raw.salt || !raw.verifier) {
    return null;
  }
  return {
    version: Number(raw.version || 1),
    iterations: Number(raw.iterations || TRUSTED_DEVICE_ITERATIONS),
    salt: String(raw.salt),
    verifier: String(raw.verifier),
    createdAt: String(raw.createdAt || ""),
  };
};

const derivePinKey = async (pin, meta) => {
  const material = await crypto.subtle.importKey(
    "raw",
    textEncoder.encode(String(pin || "")),
    "PBKDF2",
    false,
    ["deriveKey"]
  );

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: fromBase64(meta.salt),
      iterations: meta.iterations,
      hash: "SHA-256",
    },
    material,
    { name: "AES-GCM", length: 256 },
    true,
    ["encrypt", "decrypt"]
  );
};

const buildPinVerifier = async (key) => {
  const raw = await crypto.subtle.exportKey("raw", key);
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return toBase64(new Uint8Array(digest));
};

const encryptWithPin = async (payload, pin, meta) => {
  const key = await derivePinKey(pin, meta);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = textEncoder.encode(JSON.stringify(payload));
  const ciphertext = await crypto.subtle.encrypt(
    {
      name: "AES-GCM",
      iv,
    },
    key,
    plaintext
  );

  return {
    iv: toBase64(iv),
    ciphertext: toBase64(new Uint8Array(ciphertext)),
  };
};

const decryptWithPin = async ({ iv, ciphertext }, pin, meta) => {
  const key = await derivePinKey(pin, meta);
  const decrypted = await crypto.subtle.decrypt(
    {
      name: "AES-GCM",
      iv: fromBase64(iv),
    },
    key,
    fromBase64(ciphertext)
  );

  return JSON.parse(textDecoder.decode(new Uint8Array(decrypted)));
};

export const getTrustedDeviceState = () => {
  const meta = getTrustedMeta();
  return {
    enabled: Boolean(meta),
    unlocked: Boolean(!meta || trustedDeviceSessionPin),
    createdAt: meta?.createdAt || "",
  };
};

export const setTrustedDevicePin = async (pin) => {
  const value = String(pin || "").trim();
  if (value.length < 4) {
    throw new Error("Trusted device PIN must be at least 4 characters.");
  }

  if (!globalThis.crypto?.subtle) {
    throw new Error("This browser does not support secure trusted-device encryption.");
  }

  const salt = crypto.getRandomValues(new Uint8Array(16));
  const meta = {
    version: 1,
    iterations: TRUSTED_DEVICE_ITERATIONS,
    salt: toBase64(salt),
    verifier: "",
    createdAt: new Date().toISOString(),
  };
  const key = await derivePinKey(value, meta);
  meta.verifier = await buildPinVerifier(key);
  writeJsonStorage(TRUSTED_DEVICE_META_KEY, meta);
  trustedDeviceSessionPin = value;
  return getTrustedDeviceState();
};

export const unlockTrustedDevice = async (pin) => {
  const meta = getTrustedMeta();
  if (!meta) {
    throw new Error("Trusted device PIN is not configured.");
  }

  const value = String(pin || "").trim();
  if (!value) {
    throw new Error("Enter your trusted-device PIN.");
  }

  const key = await derivePinKey(value, meta);
  const verifier = await buildPinVerifier(key);
  if (verifier !== meta.verifier) {
    throw new Error("Trusted-device PIN is incorrect.");
  }

  trustedDeviceSessionPin = value;
  return getTrustedDeviceState();
};

export const lockTrustedDevice = () => {
  trustedDeviceSessionPin = "";
};

export const clearTrustedDevicePin = () => {
  trustedDeviceSessionPin = "";
  localStorage.removeItem(TRUSTED_DEVICE_META_KEY);
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

  const contentType = String(response.headers.get("content-type") || "").toLowerCase();
  const isJson = contentType.includes("application/json");

  if (!isJson) {
    const text = await response.text().catch(() => "");
    const bodyPreview = String(text || "").slice(0, 80).toLowerCase();
    const looksLikeHtml = bodyPreview.includes("<!doctype") || bodyPreview.includes("<html");
    if (looksLikeHtml || response.ok) {
      const error = new Error(
        "API misconfiguration detected. The app received HTML instead of JSON. Set VITE_API_URL to your backend service URL and redeploy frontend."
      );
      error.status = response.status;
      error.code = "API_RESPONSE_NOT_JSON";
      throw error;
    }
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
  const controller = new AbortController();
  const timeoutId = globalThis.setTimeout(() => {
    controller.abort();
  }, API_TIMEOUT_MS);

  try {
    return await fetch(url, {
      ...options,
      signal: controller.signal,
    });
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error(
        `Request timed out after ${Math.round(API_TIMEOUT_MS / 1000)}s. Check backend status and SMTP settings.`
      );
      timeoutError.code = "REQUEST_TIMEOUT";
      timeoutError.isNetworkError = true;
      timeoutError.cause = error;
      throw timeoutError;
    }

    const networkError = new Error(
      "Cannot reach the server. Check backend URL, CORS CLIENT_URL, and that /api/health is online."
    );
    networkError.code = "NETWORK_UNREACHABLE";
    networkError.isNetworkError = true;
    networkError.cause = error;
    throw networkError;
  } finally {
    globalThis.clearTimeout(timeoutId);
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
const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldPreserveSessionAfterRefreshFailure = (error) => {
  if (!error) {
    return false;
  }
  if (isNetworkError(error)) {
    return true;
  }
  if (error.code === "REQUEST_TIMEOUT") {
    return true;
  }
  return false;
};

const refreshAccessToken = async () => {
  if (refreshPromise) {
    return refreshPromise;
  }

  refreshPromise = (async () => {
    const refreshToken = readStorage(AUTH_REFRESH_STORAGE_KEY);
    if (!refreshToken) {
      return "";
    }

    let lastError = null;
    try {
      for (let attempt = 1; attempt <= 2; attempt += 1) {
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
        } catch (error) {
          lastError = error;
          if (attempt < 2 && shouldPreserveSessionAfterRefreshFailure(error)) {
            await wait(320 * attempt);
            continue;
          }
          break;
        }
      }

      if (!shouldPreserveSessionAfterRefreshFailure(lastError)) {
        clearAuthSession();
      }
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
  if (!payload?.token) {
    throw new Error(
      "Registration failed: backend response was invalid. Confirm VITE_API_URL points to your API and CORS CLIENT_URL is configured."
    );
  }
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
  if (!payload?.requiresTwoFactor && !payload?.token) {
    throw new Error(
      "Login failed: backend response was invalid. Confirm VITE_API_URL points to your API and backend auth routes are reachable."
    );
  }
  if (payload.token) {
    persistAuthSession({
      token: payload.token,
      refreshToken: payload.refreshToken,
    });
  }
  return payload;
};

export const verifyTwoFactorLogin = async ({ email, challengeId, code }) => {
  const response = await fetchWithDiagnostics(`${API_BASE}/api/auth/2fa/verify-login`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email, challengeId, code }),
  });

  const payload = await parseResponse(response);
  persistAuthSession({
    token: payload.token,
    refreshToken: payload.refreshToken,
  });
  return payload;
};

export const requestPasswordReset = async ({ email }) => {
  const response = await fetchWithDiagnostics(`${API_BASE}/api/auth/password-reset/request`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ email }),
  });
  return parseResponse(response);
};

export const confirmPasswordReset = async ({ token, newPassword }) => {
  const response = await fetchWithDiagnostics(`${API_BASE}/api/auth/password-reset/confirm`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token, newPassword }),
  });
  return parseResponse(response);
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

export const generateMt5BridgeKey = async (token, payload = {}) => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/auth/integrations/mt5/key`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    token
  );
  return parseResponse(response);
};

export const disableMt5Bridge = async (token) => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/auth/integrations/mt5/disable`,
    {
      method: "POST",
    },
    token
  );
  return parseResponse(response);
};

export const requestEmailVerification = async (token) => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/auth/email-verification/request`,
    {
      method: "POST",
    },
    token
  );
  return parseResponse(response);
};

export const fetchEmailDeliveryStatus = async (token) => {
  const response = await fetchWithAuthRetry(`${API_BASE}/api/auth/email-delivery/status`, {}, token);
  return parseResponse(response);
};

export const sendEmailDeliveryTest = async (token, email = "") => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/auth/email-delivery/test`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        email: String(email || "").trim(),
      }),
    },
    token
  );
  return parseResponse(response);
};

export const verifyEmailToken = async ({ token }) => {
  const response = await fetchWithDiagnostics(`${API_BASE}/api/auth/email-verification/verify`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ token }),
  });
  return parseResponse(response);
};

export const enableTwoFactorAuth = async (token, password) => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/auth/2fa/enable`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
    },
    token
  );
  return parseResponse(response);
};

export const disableTwoFactorAuth = async (token, password) => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/auth/2fa/disable`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ password }),
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

export const fetchSharedWeeklyReview = async (shareToken) => {
  const token = String(shareToken || "").trim();
  if (!token) {
    throw new Error("Share token is required.");
  }
  const response = await fetchWithDiagnostics(`${API_BASE}/api/trades/review/shared/${encodeURIComponent(token)}`);
  return parseResponse(response);
};

export const createWeeklyReviewShare = async (token, payload = {}) => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/trades/review/share`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    },
    token
  );
  return parseResponse(response);
};

export const listWeeklyReviewShares = async (token) => {
  const response = await fetchWithAuthRetry(`${API_BASE}/api/trades/review/shares`, {}, token);
  return parseResponse(response);
};

export const revokeWeeklyReviewShare = async (token, shareId) => {
  const response = await fetchWithAuthRetry(
    `${API_BASE}/api/trades/review/share/${encodeURIComponent(shareId)}`,
    {
      method: "DELETE",
    },
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
  writeJsonStorage(OFFLINE_SNAPSHOT_KEY, {
    version: STORAGE_SCHEMA_VERSION,
    data: snapshot,
  });
  return snapshot;
};

export const readOfflineSnapshot = () => {
  const raw = readJsonStorage(OFFLINE_SNAPSHOT_KEY, null);
  if (!raw || typeof raw !== "object") {
    return null;
  }

  // Legacy v1 shape stored snapshot directly.
  if (Array.isArray(raw.trades) || raw.analytics || raw.filters) {
    return {
      trades: Array.isArray(raw.trades) ? raw.trades : [],
      analytics: raw.analytics || null,
      filters: raw.filters || {},
      updatedAt: raw.updatedAt || "",
    };
  }

  if (raw.version >= 2 && raw.data && typeof raw.data === "object") {
    return {
      trades: Array.isArray(raw.data.trades) ? raw.data.trades : [],
      analytics: raw.data.analytics || null,
      filters: raw.data.filters || {},
      updatedAt: raw.data.updatedAt || "",
    };
  }

  return null;
};

const normalizeQueuedDraft = (draft = {}) => {
  const pair = String(draft.pair || "").trim().toUpperCase();
  return {
    profileId: String(draft.profileId || "").trim(),
    clientTradeId: String(draft.clientTradeId || "").trim(),
    pair,
    tradeDate: toIsoDate(draft.tradeDate),
    exitTime: draft.exitTime ? toIsoDate(draft.exitTime) : "",
    session: String(draft.session || "").trim(),
    tradeType: String(draft.tradeType || "").trim(),
    setupType: String(draft.setupType || "").trim(),
    entryPrice: String(toNumber(draft.entryPrice)),
    exitPrice:
      draft.exitPrice === undefined || draft.exitPrice === null || draft.exitPrice === ""
        ? ""
        : String(toNumber(draft.exitPrice)),
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
  exitTime: payload.exitTime || "",
  session: payload.session,
  tradeType: payload.tradeType,
  setupType: payload.setupType,
  entryPrice: toNumber(payload.entryPrice),
  exitPrice: payload.exitPrice === "" ? null : toNumber(payload.exitPrice, null),
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
  automation: {
    exitPrice: payload.exitPrice === "" ? null : toNumber(payload.exitPrice, null),
    exitTime: payload.exitTime || null,
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

const normalizeQueueItem = (item = {}) => {
  if (!item?.id || !item?.payload) {
    return null;
  }
  return {
    id: String(item.id),
    queuedAt: String(item.queuedAt || new Date().toISOString()),
    attempts: Number(item.attempts || 0),
    lastError: String(item.lastError || ""),
    nextRetryAt: String(item.nextRetryAt || ""),
    payload: item.payload,
    displayTrade:
      item.displayTrade ||
      buildOfflineDisplayTrade(
        String(item.id),
        item.payload,
        String(item.queuedAt || new Date().toISOString())
      ),
  };
};

export const getOfflineQueue = () => {
  const raw = readJsonStorage(OFFLINE_QUEUE_KEY, []);
  const source = Array.isArray(raw) ? raw : Array.isArray(raw?.items) ? raw.items : [];
  return source.map((item) => normalizeQueueItem(item)).filter(Boolean);
};

const writeOfflineQueue = (items = []) => {
  writeJsonStorage(OFFLINE_QUEUE_KEY, {
    version: STORAGE_SCHEMA_VERSION,
    updatedAt: new Date().toISOString(),
    items,
  });
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
    "exitTime",
    "session",
    "tradeType",
    "setupType",
    "entryPrice",
    "exitPrice",
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
