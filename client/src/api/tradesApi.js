const parseResponse = async (response) => {
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message || "Request failed");
  }
  return payload;
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

export const fetchTrades = async (filters) => {
  const response = await fetch(`/api/trades${queryString(filters)}`);
  return parseResponse(response);
};

export const fetchAnalytics = async (filters) => {
  const response = await fetch(`/api/trades/analytics${queryString(filters)}`);
  return parseResponse(response);
};

export const createTrade = async (tradeFormData) => {
  const response = await fetch("/api/trades", {
    method: "POST",
    body: tradeFormData,
  });
  return parseResponse(response);
};
