import { searchWeb } from "./search.js";

const normalizeBaseUrl = (value = "") => String(value || "").trim().replace(/\/+$/, "");

const AI_BASE_URL = normalizeBaseUrl(process.env.AI_BASE_URL || "http://localhost:11434/v1");
const AI_MODEL = String(process.env.AI_MODEL || "deepseek-r1:8b").trim();
const AI_API_KEY = String(process.env.AI_API_KEY || "ollama").trim() || "ollama";
const AI_TIMEOUT_MS = Math.max(Number(process.env.AI_TIMEOUT_MS || 90000) || 90000, 10000);

const JOURNEX_SYSTEM_PROMPT = `You are Journex Coach, an AI assistant for a trading journal.
You help traders review behavior, risk, execution, and process.
Be practical, concise, and specific.
Do not give financial guarantees or hype.
Prefer actionable coaching over generic motivation.
When fresh web results are provided, use them carefully and mention when you are relying on them.
Return plain JSON when asked.`;

const truncateText = (value = "", max = 400) => {
  const text = String(value || "").trim();
  if (text.length <= max) {
    return text;
  }
  return `${text.slice(0, Math.max(max - 3, 1))}...`;
};

const prunePayload = (value, depth = 0) => {
  if (depth >= 4) {
    return undefined;
  }

  if (value === null || value === undefined) {
    return value;
  }

  if (typeof value === "string") {
    return truncateText(value, 500);
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return value;
  }

  if (Array.isArray(value)) {
    return value
      .slice(0, 20)
      .map((item) => prunePayload(item, depth + 1))
      .filter((item) => item !== undefined);
  }

  if (typeof value === "object") {
    return Object.entries(value).reduce((acc, [key, entry]) => {
      const next = prunePayload(entry, depth + 1);
      if (next !== undefined) {
        acc[key] = next;
      }
      return acc;
    }, {});
  }

  return undefined;
};

const extractText = (response = {}) => response?.choices?.[0]?.message?.content || response?.choices?.[0]?.text || "";

const safeJsonParse = (value = "") => {
  const raw = String(value || "").trim();
  if (!raw) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch {
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) {
      return null;
    }
    try {
      return JSON.parse(match[0]);
    } catch {
      return null;
    }
  }
};

const createAbortSignal = (timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
};

const requestChatCompletion = async ({ messages, temperature = 0.3, maxTokens = 700 }) => {
  const { signal, clear } = createAbortSignal(AI_TIMEOUT_MS);

  try {
    const response = await fetch(`${AI_BASE_URL}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${AI_API_KEY}`,
      },
      body: JSON.stringify({
        model: AI_MODEL,
        temperature,
        max_tokens: maxTokens,
        messages,
      }),
      signal,
    });

    if (!response.ok) {
      const message = await response.text();
      const error = new Error(`LLM request failed (${response.status}): ${message || "unknown error"}`);
      error.statusCode = 502;
      throw error;
    }

    const data = await response.json();
    return {
      raw: extractText(data),
      model: AI_MODEL,
    };
  } catch (error) {
    if (error?.name === "AbortError") {
      const timeoutError = new Error("AI request timed out.");
      timeoutError.statusCode = 504;
      throw timeoutError;
    }
    throw error;
  } finally {
    clear();
  }
};

export const getAiConfig = () => ({
  baseUrl: AI_BASE_URL,
  model: AI_MODEL,
  provider: String(process.env.AI_PROVIDER_LABEL || "open-source-llm").trim() || "open-source-llm",
});

export const requestStructuredCoachResponse = async ({ mode, payload }) => {
  const compactPayload = prunePayload(payload);
  const schemaInstruction =
    mode === "review"
      ? "Return strict JSON with keys: summary, keep, stop, test, risk_watch, confidence_note. keep/stop/test must be arrays of short strings."
      : "Return strict JSON with keys: summary, setup_quality, risk_note, execution_note, next_step, warning.";

  const userPrompt = [
    `Mode: ${mode}`,
    schemaInstruction,
    "Use the Journex data below only.",
    JSON.stringify(compactPayload, null, 2),
  ].join("\n\n");

  const response = await requestChatCompletion({
    messages: [
      { role: "system", content: JOURNEX_SYSTEM_PROMPT },
      { role: "user", content: userPrompt },
    ],
  });
  const content = response.raw;
  const parsed = safeJsonParse(content);

  return {
    raw: content,
    parsed,
    model: response.model,
  };
};

export const requestChatResponse = async ({ messages = [], context = null, useWeb = false }) => {
  const sanitizedMessages = Array.isArray(messages)
    ? messages
        .filter((item) => item && typeof item === "object")
        .slice(-12)
        .map((item) => ({
          role: item.role === "assistant" ? "assistant" : "user",
          content: truncateText(item.content, 1200),
        }))
    : [];

  const compactContext = prunePayload(context);
  const systemParts = [JOURNEX_SYSTEM_PROMPT];
  if (compactContext && Object.keys(compactContext).length) {
    systemParts.push(`Current Journex context:\n${JSON.stringify(compactContext, null, 2)}`);
  }
  if (useWeb) {
    const latestUserPrompt = [...sanitizedMessages].reverse().find((item) => item.role === "user")?.content || "";
    const results = await searchWeb(latestUserPrompt);
    if (results.length) {
      systemParts.push(`Fresh web search results:\n${JSON.stringify(results, null, 2)}`);
    }
  }

  const response = await requestChatCompletion({
    messages: [
      { role: "system", content: systemParts.join("\n\n") },
      ...sanitizedMessages,
    ],
    temperature: 0.4,
    maxTokens: 900,
  });

  return response;
};
