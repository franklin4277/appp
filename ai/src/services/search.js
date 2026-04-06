const SEARCH_BASE_URL = String(process.env.SEARCH_BASE_URL || "").trim().replace(/\/+$/, "");
const SEARCH_TIMEOUT_MS = Math.max(Number(process.env.SEARCH_TIMEOUT_MS || 12000) || 12000, 3000);

const createAbortSignal = (timeoutMs) => {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return {
    signal: controller.signal,
    clear: () => clearTimeout(timer),
  };
};

export const isSearchConfigured = () => Boolean(SEARCH_BASE_URL);

export const searchWeb = async (query = "") => {
  const normalized = String(query || "").trim();
  if (!normalized || !SEARCH_BASE_URL) {
    return [];
  }

  const { signal, clear } = createAbortSignal(SEARCH_TIMEOUT_MS);

  try {
    const url = new URL(`${SEARCH_BASE_URL}/search`);
    url.searchParams.set("q", normalized);
    url.searchParams.set("format", "json");
    url.searchParams.set("language", "en");
    url.searchParams.set("safesearch", "0");

    const response = await fetch(url, { signal });
    if (!response.ok) {
      return [];
    }
    const data = await response.json();
    const results = Array.isArray(data?.results) ? data.results : [];

    return results.slice(0, 5).map((item) => ({
      title: String(item?.title || "").trim(),
      url: String(item?.url || "").trim(),
      content: String(item?.content || "").trim().slice(0, 280),
    }));
  } catch {
    return [];
  } finally {
    clear();
  }
};
