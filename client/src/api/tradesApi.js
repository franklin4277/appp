const API_BASE = (import.meta.env.VITE_API_URL || "").replace(/\/$/, "");
export const AUTH_STORAGE_KEY = "trading-journal-token";

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

const fetchWithDiagnostics = async (url, options = {}) => {
  try {
    return await fetch(url, options);
  } catch (error) {
    const networkError = new Error(
      "Cannot reach the server. Check backend URL, CORS CLIENT_URL, and that /api/health is online."
    );
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
