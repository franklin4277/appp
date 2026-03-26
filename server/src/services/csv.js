const CSV_HEADERS = [
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
  "screenshotBefore",
  "screenshotAfter",
];

const normalizeValue = (value) => (value === undefined || value === null ? "" : String(value));

const escapeCell = (value) => {
  const text = normalizeValue(value);
  if (!/[",\n]/.test(text)) {
    return text;
  }
  return `"${text.replace(/"/g, '""')}"`;
};

const parseCsvLine = (line = "") => {
  const cells = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index];
    if (char === '"') {
      const nextChar = line[index + 1];
      if (inQuotes && nextChar === '"') {
        current += '"';
        index += 1;
        continue;
      }
      inQuotes = !inQuotes;
      continue;
    }

    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }

    current += char;
  }

  cells.push(current);
  return cells.map((cell) => cell.trim());
};

export const buildTradesCsv = (trades = []) => {
  const lines = [CSV_HEADERS.join(",")];

  trades.forEach((trade) => {
    const row = [
      trade.pair,
      trade.tradeDate,
      trade.session,
      trade.tradeType,
      trade.setupType,
      trade.entryPrice,
      trade.stopLoss,
      trade.takeProfit,
      trade.riskPercent,
      trade.lotSize,
      trade.result,
      trade.rrAchieved,
      trade.tags?.asiaHighLowUsed,
      trade.tags?.pocInteraction,
      trade.tags?.pocOutcome,
      trade.tags?.cleanSetup,
      trade.ruleBreakReason,
      trade.notes?.priceAction,
      trade.notes?.executionReview,
      trade.notes?.emotionalState,
      trade.screenshots?.before,
      trade.screenshots?.after,
    ].map(escapeCell);

    lines.push(row.join(","));
  });

  return lines.join("\n");
};

export const parseTradesCsv = (csvText = "") => {
  const normalized = String(csvText || "").replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const lines = normalized.split("\n").filter((line) => line.trim().length > 0);
  if (!lines.length) {
    return [];
  }

  const header = parseCsvLine(lines[0]);
  const headerMap = new Map(header.map((key, index) => [key, index]));

  return lines.slice(1).map((line) => {
    const cells = parseCsvLine(line);
    const row = {};
    CSV_HEADERS.forEach((key) => {
      const columnIndex = headerMap.get(key);
      row[key] = columnIndex === undefined ? "" : normalizeValue(cells[columnIndex] || "");
    });
    return row;
  });
};

