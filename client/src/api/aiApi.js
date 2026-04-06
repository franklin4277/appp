const normalizeApiBase = (value = "") => String(value || "").trim().replace(/\/+$/, "");

const AI_BASE = normalizeApiBase(import.meta.env.VITE_AI_URL || "");
const AI_TIMEOUT_MS = Math.max(Number(import.meta.env.VITE_AI_TIMEOUT_MS || 90000) || 90000, 10000);

const createAbortSignal = (timeoutMs) => {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => window.clearTimeout(timer),
  };
};

const parseJson = async (response) => {
  const text = await response.text();
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    return { message: text || "Invalid AI response." };
  }
};

const request = async (path, payload) => {
  if (!AI_BASE) {
    throw new Error("AI service is not configured. Set VITE_AI_URL.");
  }

  const { signal, clear } = createAbortSignal(AI_TIMEOUT_MS);
  try {
    const response = await fetch(`${AI_BASE}${path}`, {
      method: payload ? "POST" : "GET",
      headers: {
        "Content-Type": "application/json",
      },
      body: payload ? JSON.stringify(payload) : undefined,
      signal,
    });

    const data = await parseJson(response);
    if (!response.ok) {
      throw new Error(data?.message || `AI request failed (${response.status}).`);
    }
    return data;
  } catch (error) {
    if (error?.name === "AbortError") {
      throw new Error("AI request timed out.");
    }
    throw error;
  } finally {
    clear();
  }
};

export const isAiConfigured = () => Boolean(AI_BASE);

export const fetchAiConfig = async () => request("/api/coach/config");

export const sendAiChat = async ({ messages = [], context = null, useWeb = false }) =>
  request("/api/coach/chat", {
    messages,
    context,
    useWeb,
  });
