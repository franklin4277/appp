const normalizeUrl = (value = "") => String(value || "").trim().replace(/\/+$/, "");

const AI_SERVICE_URL = normalizeUrl(process.env.AI_SERVICE_URL || "");
const AI_SERVICE_TOKEN = String(process.env.AI_SERVICE_TOKEN || "").trim();
const AI_PROXY_TIMEOUT_MS = Math.max(Number(process.env.AI_PROXY_TIMEOUT_MS || 90000) || 90000, 10000);

const createAbortSignal = (timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
};

const badGateway = (message) => {
  const error = new Error(message);
  error.statusCode = 502;
  return error;
};

const ensureConfigured = () => {
  if (!AI_SERVICE_URL) {
    const error = new Error("AI service is not configured on the backend.");
    error.statusCode = 503;
    throw error;
  }
};

const buildHeaders = () => {
  const headers = {
    "Content-Type": "application/json",
  };
  if (AI_SERVICE_TOKEN) {
    headers["x-ai-service-token"] = AI_SERVICE_TOKEN;
  }
  return headers;
};

const parseJson = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text || "Invalid AI proxy response." };
  }
};

const proxyRequest = async (path, { method = "GET", body } = {}) => {
  ensureConfigured();
  const { signal, clear } = createAbortSignal(AI_PROXY_TIMEOUT_MS);

  try {
    const response = await fetch(`${AI_SERVICE_URL}${path}`, {
      method,
      headers: buildHeaders(),
      body: body ? JSON.stringify(body) : undefined,
      signal,
    });
    const payload = await parseJson(response);
    if (!response.ok) {
      throw badGateway(payload?.message || `AI service failed (${response.status}).`);
    }
    return payload;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw badGateway("AI service timed out.");
    }
    throw error.statusCode ? error : badGateway(error?.message || "AI proxy request failed.");
  } finally {
    clear();
  }
};

export const getAiServiceConfig = async () => proxyRequest("/api/coach/config");

export const requestAiChat = async ({ messages = [], context = null, useWeb = false }) =>
  proxyRequest("/api/coach/chat", {
    method: "POST",
    body: {
      messages,
      context,
      useWeb,
    },
  });

