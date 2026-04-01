import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createTrade, isNetworkError, queueTradeOffline } from "../api/tradesApi";
import { POC_OUTCOMES, PAIRS, RESULTS, SESSIONS, SETUP_TYPES, TRADE_TYPES } from "../utils/options";
import { compressImageFile, formatBytes } from "../utils/imageCompression";
import { calculateAchievedRR, calculateLotSize, calculatePlannedRR, round } from "../utils/tradeMath";

const PRESET_STORAGE_KEY = "trading-journal-presets";
const LAST_STRUCTURE_STORAGE_KEY = "trading-journal-last-structure";
const DRAFT_STORAGE_PREFIX = "trading-journal-form-draft";
const NEGATIVE_EMOTION_TOKENS = [
  "fomo",
  "rushed",
  "rush",
  "revenge",
  "tilt",
  "angry",
  "fear",
  "anxious",
  "anxiety",
  "tired",
  "impatient",
  "stressed",
  "overconfident",
];
const LIVE_ALERT_REFRESH_MS = 15000;
const RAPID_TRADE_WINDOW_MINUTES = 8;

const localNow = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
};

const generateClientTradeId = () => `ct-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
const buildDraftStorageKey = (profileId = "") => `${DRAFT_STORAGE_PREFIX}:${String(profileId || "main")}`;

const buildOptionLists = (settings = {}) => ({
  pairs: (() => {
    const source = settings?.options?.pairs?.length ? settings.options.pairs : PAIRS;
    const normalized = source
      .map((pair) =>
        String(pair || "")
          .toUpperCase()
          .replace(/\s+/g, "")
      )
      .filter((pair) => pair.length >= 3 && pair.length <= 15);
    return normalized.length ? normalized : PAIRS;
  })(),
  sessions: settings?.options?.sessions?.length ? settings.options.sessions : SESSIONS,
  setupTypes: settings?.options?.setupTypes?.length ? settings.options.setupTypes : SETUP_TYPES,
  tradeTypes: settings?.options?.tradeTypes?.length ? settings.options.tradeTypes : TRADE_TYPES,
  results: settings?.options?.results?.length ? settings.options.results : RESULTS,
  pocOutcomes: settings?.options?.pocOutcomes?.length ? settings.options.pocOutcomes : POC_OUTCOMES,
});

const buildInitialState = (options) => ({
  clientTradeId: generateClientTradeId(),
  profileId: "",
  pair: options.pairs[0] || "EURUSD",
  tradeDate: localNow(),
  exitTime: "",
  session: options.sessions[0] || "London",
  tradeType: options.tradeTypes[0] || "Buy",
  setupType: options.setupTypes[0] || "Asia Break -> Continuation",
  entryPrice: "",
  exitPrice: "",
  stopLoss: "",
  takeProfit: "",
  riskPercent: "1",
  lotSize: "",
  result: options.results[0] || "Win",
  asiaHighLowUsed: "true",
  pocInteraction: "true",
  pocOutcome: options.pocOutcomes[0] || "Acceptance",
  cleanSetup: false,
  ruleBreakReason: "",
  priceAction: "",
  executionReview: "",
  emotionalState: "",
  screenshotBefore: null,
  screenshotAfter: null,
  screenshotBeforeNote: "",
  screenshotAfterNote: "",
});

const hasMeaningfulDraft = (draft = {}) => {
  const textFields = [
    "entryPrice",
    "exitPrice",
    "stopLoss",
    "takeProfit",
    "priceAction",
    "executionReview",
    "emotionalState",
    "ruleBreakReason",
    "screenshotBeforeNote",
    "screenshotAfterNote",
  ];

  if (textFields.some((field) => String(draft[field] || "").trim())) {
    return true;
  }

  return Boolean(draft.cleanSetup || draft.screenshotBefore || draft.screenshotAfter);
};

const Field = ({ label, children }) => (
  <label>
    <span className="label">{label}</span>
    {children}
  </label>
);

const ScreenshotField = ({ label, file, note, onFileChange, onNoteChange }) => {
  const [dragOver, setDragOver] = useState(false);
  const previewUrl = useMemo(() => {
    if (!file) {
      return "";
    }
    return URL.createObjectURL(file);
  }, [file]);

  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  const onDrop = (event) => {
    event.preventDefault();
    setDragOver(false);
    const dropped = event.dataTransfer?.files?.[0] || null;
    if (dropped) {
      onFileChange(dropped);
    }
  };

  return (
    <div className="space-y-2">
      <span className="label">{label}</span>
      <div
        className={`rounded-xl border p-3 text-xs transition ${
          dragOver ? "border-accent bg-panel" : "border-border bg-panelMuted"
        }`}
        onDragOver={(event) => {
          event.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        {file ? (
          <div className="space-y-2">
            {previewUrl ? (
              <img src={previewUrl} alt={`${label} preview`} className="h-40 w-full rounded-md object-cover" />
            ) : null}
            <p className="text-textMuted">{file.name}</p>
          </div>
        ) : (
          <p className="text-textMuted">Drop image here or choose file.</p>
        )}

        <input
          className="input mt-2"
          type="file"
          accept="image/png,image/jpeg,image/jpg,image/webp"
          onChange={(event) => onFileChange(event.target.files?.[0] || null)}
        />
      </div>

      <textarea
        className="input min-h-20"
        placeholder="Annotation notes"
        value={note}
        onChange={(event) => onNoteChange(event.target.value)}
      />
    </div>
  );
};

const toTime = (trade) => {
  const value = trade?.tradeDate || trade?.createdAt || "";
  const timestamp = new Date(value).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const toDayKey = (value) => {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`;
};

const normalizeEmotionTokens = (text = "") =>
  String(text)
    .toLowerCase()
    .split(/[,\|/; ]+/)
    .map((item) => item.trim())
    .filter(Boolean);

const scoreToGrade = (score) => {
  if (score >= 90) {
    return "A+";
  }
  if (score >= 80) {
    return "A";
  }
  if (score >= 65) {
    return "B";
  }
  if (score >= 50) {
    return "C";
  }
  return "D";
};

const deriveResultFromExit = ({ tradeType, entryPrice, exitPrice }) => {
  const entry = Number(entryPrice);
  const exit = Number(exitPrice);
  if (!Number.isFinite(entry) || !Number.isFinite(exit)) {
    return "";
  }

  if (String(tradeType || "").toLowerCase().startsWith("buy")) {
    if (exit > entry) {
      return "Win";
    }
    if (exit < entry) {
      return "Loss";
    }
    return "BE";
  }

  if (String(tradeType || "").toLowerCase().startsWith("sell")) {
    if (exit < entry) {
      return "Win";
    }
    if (exit > entry) {
      return "Loss";
    }
    return "BE";
  }

  return "";
};

const calculateAchievedRRFromExit = ({ entryPrice, stopLoss, exitPrice, tradeType }) => {
  const entry = Number(entryPrice);
  const stop = Number(stopLoss);
  const exit = Number(exitPrice);
  if (!Number.isFinite(entry) || !Number.isFinite(stop) || !Number.isFinite(exit)) {
    return Number.NaN;
  }
  const risk = Math.abs(entry - stop);
  if (!risk) {
    return Number.NaN;
  }

  const direction = String(tradeType || "").toLowerCase().startsWith("sell") ? -1 : 1;
  const rr = ((exit - entry) * direction) / risk;
  return round(rr, 2);
};

const QUICK_ENTRY_TEMPLATES = [
  {
    id: "london-cont",
    label: "London Continuation",
    values: {
      session: "London",
      setupType: "Asia Break -> Continuation",
      pocOutcome: "Acceptance",
      asiaHighLowUsed: "true",
      pocInteraction: "true",
      cleanSetup: true,
    },
  },
  {
    id: "london-rej",
    label: "London Rejection",
    values: {
      session: "London",
      setupType: "Asia Break -> Reversal",
      pocOutcome: "Rejection",
      asiaHighLowUsed: "true",
      pocInteraction: "true",
      cleanSetup: true,
    },
  },
  {
    id: "ny-momentum",
    label: "NY Momentum",
    values: {
      session: "New York",
      setupType: "Asia Break -> Continuation",
      pocOutcome: "Acceptance",
      asiaHighLowUsed: "true",
      pocInteraction: "true",
      cleanSetup: false,
    },
  },
];

const TradeEntryForm = ({ onTradeSaved, token, settings, trades = [], activeProfileId = "" }) => {
  const optionLists = useMemo(() => buildOptionLists(settings), [settings]);
  const [form, setForm] = useState(() => buildInitialState(optionLists));
  const [accountBalance, setAccountBalance] = useState("10000");
  const [pipValuePerLot, setPipValuePerLot] = useState("10");
  const [autoLotSize, setAutoLotSize] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [presets, setPresets] = useState([]);
  const [presetName, setPresetName] = useState("");
  const [lastStructure, setLastStructure] = useState(null);
  const [checklistWarnings, setChecklistWarnings] = useState([]);
  const [guardrailWarnings, setGuardrailWarnings] = useState([]);
  const [successWarning, setSuccessWarning] = useState("");
  const [mediaOptimizationMessage, setMediaOptimizationMessage] = useState("");
  const [savedDraft, setSavedDraft] = useState(null);
  const [draftReady, setDraftReady] = useState(false);
  const [alertClockTs, setAlertClockTs] = useState(() => Date.now());
  const formRef = useRef(null);
  const draftStorageKey = useMemo(() => buildDraftStorageKey(activeProfileId), [activeProfileId]);

  const activeRiskControls = settings?.riskControls || {
    requireRuleAlignment: true,
    maxTradesPerSession: 4,
    cooldownMinutesAfterLoss: 30,
    stopForDayLossRR: 3,
    strictChecklistGate: false,
  };

  const plannedRR = useMemo(
    () =>
      calculatePlannedRR({
        entryPrice: form.entryPrice,
        stopLoss: form.stopLoss,
        takeProfit: form.takeProfit,
      }),
    [form.entryPrice, form.stopLoss, form.takeProfit]
  );

  const derivedResult = useMemo(
    () =>
      deriveResultFromExit({
        tradeType: form.tradeType,
        entryPrice: form.entryPrice,
        exitPrice: form.exitPrice,
      }),
    [form.entryPrice, form.exitPrice, form.tradeType]
  );

  const effectiveResult = derivedResult || form.result;

  const achievedRR = useMemo(() => {
    const fromExit = calculateAchievedRRFromExit({
      entryPrice: form.entryPrice,
      stopLoss: form.stopLoss,
      exitPrice: form.exitPrice,
      tradeType: form.tradeType,
    });
    if (Number.isFinite(fromExit)) {
      return fromExit;
    }
    return calculateAchievedRR(plannedRR, effectiveResult);
  }, [effectiveResult, form.entryPrice, form.exitPrice, form.stopLoss, form.tradeType, plannedRR]);

  const computedLotSize = useMemo(
    () =>
      calculateLotSize({
        accountBalance,
        riskPercent: form.riskPercent,
        entryPrice: form.entryPrice,
        stopLoss: form.stopLoss,
        pair: form.pair,
        pipValuePerLot: Number(pipValuePerLot) || 10,
      }),
    [accountBalance, form.entryPrice, form.pair, form.riskPercent, form.stopLoss, pipValuePerLot]
  );

  const requiresRuleBreakReason = form.asiaHighLowUsed !== "true" || form.pocInteraction !== "true";
  const checklistAligned = form.asiaHighLowUsed === "true" && form.pocInteraction === "true" && form.cleanSetup;

  const qualityAssessment = useMemo(() => {
    let score = 55;
    const notes = [];

    if (form.asiaHighLowUsed === "true") {
      score += 18;
    } else {
      score -= 24;
      notes.push("Missing Asia High/Low reaction.");
    }

    if (form.pocInteraction === "true") {
      score += 16;
      if (String(form.pocOutcome || "").trim()) {
        score += 6;
      }
    } else {
      score -= 20;
      notes.push("No POC interaction marked.");
    }

    if (form.cleanSetup) {
      score += 16;
    } else {
      score -= 10;
      notes.push("Not marked as clean setup.");
    }

    const rr = Number(plannedRR) || 0;
    if (rr >= 2) {
      score += 10;
    } else if (rr >= 1.2) {
      score += 4;
    } else if (rr > 0 && rr < 1) {
      score -= 16;
      notes.push("Planned RR is below 1.0.");
    }

    if (String(form.ruleBreakReason || "").trim()) {
      score -= 8;
      notes.push("Rule-break reason entered.");
    }

    const emotionFlags = normalizeEmotionTokens(form.emotionalState).filter((token) =>
      NEGATIVE_EMOTION_TOKENS.includes(token)
    );
    if (emotionFlags.length) {
      score -= Math.min(emotionFlags.length * 6, 18);
      notes.push(`Emotional risk: ${emotionFlags.slice(0, 3).join(", ")}.`);
    }

    const clamped = Math.max(0, Math.min(100, Math.round(score)));
    const grade = scoreToGrade(clamped);
    let tip = "Quality looks strong. Keep execution tight.";

    if (grade === "B" || grade === "C") {
      tip = "Confirm Asia High/Low and clean context before entry.";
    }
    if (grade === "D") {
      tip = "High-risk setup. Consider skipping this trade.";
    }

    return {
      score: clamped,
      grade,
      notes: notes.slice(0, 3),
      tip,
    };
  }, [
    form.asiaHighLowUsed,
    form.cleanSetup,
    form.emotionalState,
    form.pocInteraction,
    form.pocOutcome,
    form.ruleBreakReason,
    plannedRR,
  ]);

  const historicalTimeline = useMemo(
    () =>
      trades
        .map((trade) => ({
          ...trade,
          _ts: toTime(trade),
          _dayKey: toDayKey(trade.tradeDate),
        }))
        .sort((a, b) => b._ts - a._ts),
    [trades]
  );

  useEffect(() => {
    const timer = window.setInterval(() => setAlertClockTs(Date.now()), LIVE_ALERT_REFRESH_MS);
    return () => window.clearInterval(timer);
  }, []);

  const preTradeAlerts = useMemo(() => {
    const warnings = [];
    const tradeTs = new Date(form.tradeDate || new Date()).getTime();
    const safeTs = Number.isFinite(tradeTs) ? tradeTs : Date.now();
    const useLiveClock = Math.abs(alertClockTs - safeTs) <= 15 * 60 * 1000;
    const effectiveTs = useLiveClock ? alertClockTs : safeTs;
    const dayKey = toDayKey(effectiveTs);

    const sameSessionToday = historicalTimeline.filter(
      (trade) =>
        trade.session === form.session &&
        trade._dayKey === dayKey &&
        trade._ts <= effectiveTs
    );

    const maxTradesPerSession = Number(activeRiskControls.maxTradesPerSession || 0);
    if (maxTradesPerSession > 0 && sameSessionToday.length >= maxTradesPerSession) {
      warnings.push({
        id: "overtrading-limit",
        level: "critical",
        message: `Overtrading limit reached: ${sameSessionToday.length}/${maxTradesPerSession} ${form.session} trades already logged today.`,
      });
    } else if (
      maxTradesPerSession > 1 &&
      sameSessionToday.length === maxTradesPerSession - 1
    ) {
      warnings.push({
        id: "overtrading-near",
        level: "warn",
        message: `Near overtrading limit: next ${form.session} trade hits ${maxTradesPerSession} max trades.`,
      });
    }

    const latestSameSessionTrade = sameSessionToday[0];
    if (latestSameSessionTrade?._ts) {
      const sinceLastTrade = Math.max(0, Math.floor((effectiveTs - latestSameSessionTrade._ts) / 60000));
      if (sinceLastTrade < RAPID_TRADE_WINDOW_MINUTES) {
        warnings.push({
          id: "rapid-fire",
          level: "warn",
          message: `Rapid-fire warning: last ${form.session} trade was ${sinceLastTrade}m ago. Pause to avoid impulse entries.`,
        });
      }
    }

    const lastLoss = historicalTimeline.find((trade) => trade.result === "Loss" && trade._ts <= effectiveTs);
    if (lastLoss) {
      const minutesSinceLoss = Math.floor((effectiveTs - lastLoss._ts) / 60000);
      const cooldown = Number(activeRiskControls.cooldownMinutesAfterLoss || 0);
      if (cooldown > 0 && minutesSinceLoss < cooldown) {
        warnings.push({
          id: "cooldown",
          level: "warn",
          message: `Cooldown active: wait ${cooldown - minutesSinceLoss} more minute${cooldown - minutesSinceLoss === 1 ? "" : "s"} after last loss.`,
        });
      }
    }

    const todayNetRR = historicalTimeline
      .filter((trade) => trade._dayKey === dayKey && trade._ts <= effectiveTs)
      .reduce((sum, trade) => sum + (Number(trade.rrAchieved) || 0), 0);
    const stopDayRR = -Math.abs(Number(activeRiskControls.stopForDayLossRR || 0));
    if (stopDayRR < 0 && todayNetRR <= stopDayRR) {
      warnings.push({
        id: "daily-stop",
        level: "critical",
        message: `Daily loss guardrail reached (${todayNetRR.toFixed(2)} RR). Stand down for today.`,
      });
    }

    if (qualityAssessment.grade === "D") {
      warnings.push({
        id: "quality-d",
        level: "warn",
        message: "Setup quality is D-grade. Wait for a cleaner confirmation.",
      });
    }

    return warnings;
  }, [
    alertClockTs,
    activeRiskControls.cooldownMinutesAfterLoss,
    activeRiskControls.maxTradesPerSession,
    activeRiskControls.stopForDayLossRR,
    form.session,
    form.tradeDate,
    historicalTimeline,
    qualityAssessment.grade,
  ]);

  const hasCriticalPreTradeAlert = useMemo(
    () => preTradeAlerts.some((alert) => alert.level === "critical"),
    [preTradeAlerts]
  );

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(PRESET_STORAGE_KEY);
    if (stored) {
      try {
        setPresets(JSON.parse(stored));
      } catch {
        setPresets([]);
      }
    }
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem(LAST_STRUCTURE_STORAGE_KEY);
    if (!stored) {
      return;
    }

    try {
      setLastStructure(JSON.parse(stored));
    } catch {
      setLastStructure(null);
    }
  }, []);

  useEffect(() => {
    setDraftReady(false);
    const stored = localStorage.getItem(draftStorageKey);
    if (!stored) {
      setSavedDraft(null);
      setDraftReady(true);
      return;
    }

    try {
      const parsed = JSON.parse(stored);
      if (parsed?.form && typeof parsed.form === "object" && hasMeaningfulDraft(parsed.form)) {
        setSavedDraft({
          form: parsed.form,
          savedAt: parsed.savedAt || "",
        });
      } else {
        setSavedDraft(null);
      }
    } catch {
      setSavedDraft(null);
    } finally {
      setDraftReady(true);
    }
  }, [draftStorageKey]);

  useEffect(() => {
    setForm((prev) => ({
      ...prev,
      profileId: activeProfileId || prev.profileId,
      pair: optionLists.pairs.includes(prev.pair) ? prev.pair : optionLists.pairs[0] || "",
      session: prev.session || optionLists.sessions[0] || "",
      tradeType: prev.tradeType || optionLists.tradeTypes[0] || "",
      setupType: prev.setupType || optionLists.setupTypes[0] || "",
      result: prev.result || optionLists.results[0] || "",
      pocOutcome: prev.pocOutcome || optionLists.pocOutcomes[0] || "",
    }));
  }, [activeProfileId, optionLists]);

  useEffect(() => {
    if (!draftReady) {
      return undefined;
    }

    const timer = window.setTimeout(() => {
      const draftForm = {
        ...form,
        profileId: activeProfileId || form.profileId || "",
        screenshotBefore: null,
        screenshotAfter: null,
      };
      if (!hasMeaningfulDraft(draftForm)) {
        localStorage.removeItem(draftStorageKey);
        return;
      }
      localStorage.setItem(
        draftStorageKey,
        JSON.stringify({
          savedAt: new Date().toISOString(),
          form: draftForm,
        })
      );
    }, 700);

    return () => window.clearTimeout(timer);
  }, [activeProfileId, draftReady, draftStorageKey, form]);

  const persistPresets = (next) => {
    setPresets(next);
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
  };

  const captureTradeStructure = () => ({
    pair: form.pair,
    session: form.session,
    tradeType: form.tradeType,
    setupType: form.setupType,
    result: form.result,
    riskPercent: form.riskPercent,
    asiaHighLowUsed: form.asiaHighLowUsed,
    pocInteraction: form.pocInteraction,
    pocOutcome: form.pocOutcome,
    cleanSetup: form.cleanSetup,
  });

  const persistLastStructure = () => {
    const structure = captureTradeStructure();
    setLastStructure(structure);
    localStorage.setItem(LAST_STRUCTURE_STORAGE_KEY, JSON.stringify(structure));
  };

  const clearSavedDraft = useCallback(() => {
    localStorage.removeItem(draftStorageKey);
    setSavedDraft(null);
  }, [draftStorageKey]);

  const restoreSavedDraft = useCallback(() => {
    if (!savedDraft?.form) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      ...savedDraft.form,
      profileId: activeProfileId || savedDraft.form.profileId || prev.profileId,
      clientTradeId: savedDraft.form.clientTradeId || prev.clientTradeId || generateClientTradeId(),
      screenshotBefore: null,
      screenshotAfter: null,
    }));
    setSuccessWarning("Draft restored.");
    setError("");
  }, [activeProfileId, savedDraft]);

  const handleSavePreset = () => {
    if (!presetName.trim()) {
      return;
    }

    const entry = {
      label: presetName.trim(),
      data: {
        pair: form.pair,
        session: form.session,
        tradeType: form.tradeType,
        setupType: form.setupType,
        result: form.result,
      },
    };

    const next = [entry, ...presets].slice(0, 8);
    persistPresets(next);
    setPresetName("");
  };

  const handleApplyPreset = (preset) => {
    setForm((prev) => ({
      ...prev,
      pair: preset.data.pair,
      session: preset.data.session,
      tradeType: preset.data.tradeType,
      setupType: preset.data.setupType,
      result: preset.data.result,
    }));
  };

  const handleRemovePreset = (label) => {
    persistPresets(presets.filter((item) => item.label !== label));
  };

  const handleApplyLastStructure = () => {
    if (!lastStructure) {
      return;
    }

    setForm((prev) => ({
      ...prev,
      pair: lastStructure.pair || prev.pair,
      session: lastStructure.session || prev.session,
      tradeType: lastStructure.tradeType || prev.tradeType,
      setupType: lastStructure.setupType || prev.setupType,
      result: lastStructure.result || prev.result,
      riskPercent: lastStructure.riskPercent || prev.riskPercent,
      asiaHighLowUsed: lastStructure.asiaHighLowUsed || prev.asiaHighLowUsed,
      pocInteraction: lastStructure.pocInteraction || prev.pocInteraction,
      pocOutcome: lastStructure.pocOutcome || prev.pocOutcome,
      cleanSetup:
        typeof lastStructure.cleanSetup === "boolean" ? lastStructure.cleanSetup : prev.cleanSetup,
    }));
  };

  const handleQuickTemplate = (template) => {
    if (!template?.values) {
      return;
    }
    setForm((prev) => ({
      ...prev,
      ...template.values,
      tradeDate: localNow(),
      result: template.values.result || prev.result,
      ruleBreakReason: "",
    }));
  };

  const handleChange = (field, value) => {
    setError("");
    setChecklistWarnings([]);
    setGuardrailWarnings([]);
    setSuccessWarning("");
    setMediaOptimizationMessage("");
    let normalizedValue = value;
    if (field === "pair") {
      const normalizedPair = String(value || "")
        .toUpperCase()
        .replace(/\s+/g, "");
      normalizedValue = normalizedPair || optionLists.pairs[0] || "EURUSD";
    }
    setForm((prev) => ({
      ...prev,
      [field]: normalizedValue,
    }));
  };

  const handleScreenshotChange = async (field, file) => {
    setError("");
    setChecklistWarnings([]);
    setGuardrailWarnings([]);
    setSuccessWarning("");

    if (!file) {
      setMediaOptimizationMessage("");
      setForm((prev) => ({
        ...prev,
        [field]: null,
      }));
      return;
    }

    const optimized = await compressImageFile(file);
    setForm((prev) => ({
      ...prev,
      [field]: optimized.file || file,
    }));

    setMediaOptimizationMessage((prev) => {
      if (!optimized.compressed) {
        return prev;
      }
      const nextPart = `${field === "screenshotBefore" ? "Before" : "After"}: ${formatBytes(
        optimized.originalBytes
      )} -> ${formatBytes(optimized.outputBytes)}`;
      if (!prev) {
        return `Optimized screenshots | ${nextPart}`;
      }
      const [head] = String(prev).split("|");
      return `${head.trim()} | ${nextPart}`;
    });

    if (optimized.compressed) {
      return;
    }
  };

  const resetTradeForm = useCallback(() => {
    setForm((prev) => ({
      ...prev,
      clientTradeId: generateClientTradeId(),
      profileId: activeProfileId || prev.profileId,
      tradeDate: localNow(),
      exitTime: "",
      entryPrice: "",
      exitPrice: "",
      stopLoss: "",
      takeProfit: "",
      result: optionLists.results[0] || "Win",
      lotSize: "",
      ruleBreakReason: "",
      priceAction: "",
      executionReview: "",
      emotionalState: "",
      screenshotBefore: null,
      screenshotAfter: null,
      screenshotBeforeNote: "",
      screenshotAfterNote: "",
    }));

    if (formRef.current) {
      formRef.current.reset();
    }
    clearSavedDraft();
  }, [activeProfileId, clearSavedDraft, optionLists.results]);

  const buildTradePayload = (acceptGuardrailOverride = false) => {
    const lotSizeToSave = autoLotSize ? computedLotSize : Number(form.lotSize || 0);
    const normalizedPair = String(form.pair || "")
      .toUpperCase()
      .replace(/\s+/g, "");

    return {
      profileId: form.profileId || activeProfileId || "",
      clientTradeId: form.clientTradeId || generateClientTradeId(),
      pair: normalizedPair || optionLists.pairs[0] || "EURUSD",
      tradeDate: form.tradeDate ? new Date(form.tradeDate).toISOString() : new Date().toISOString(),
      exitTime: form.exitTime ? new Date(form.exitTime).toISOString() : "",
      session: form.session,
      tradeType: form.tradeType,
      setupType: form.setupType,
      entryPrice: form.entryPrice,
      exitPrice: form.exitPrice,
      stopLoss: form.stopLoss,
      takeProfit: form.takeProfit,
      riskPercent: form.riskPercent,
      lotSize: lotSizeToSave > 0 ? String(round(lotSizeToSave, 2)) : "",
      result: effectiveResult,
      rrAchieved: String(achievedRR),
      asiaHighLowUsed: form.asiaHighLowUsed,
      pocInteraction: form.pocInteraction,
      pocOutcome: form.pocInteraction === "true" ? form.pocOutcome : "",
      cleanSetup: String(form.cleanSetup),
      ruleBreakReason: form.ruleBreakReason,
      priceAction: form.priceAction,
      executionReview: form.executionReview,
      emotionalState: form.emotionalState,
      acceptGuardrailOverride: String(acceptGuardrailOverride),
      screenshotBeforeName: form.screenshotBefore?.name || "",
      screenshotAfterName: form.screenshotAfter?.name || "",
      screenshotBeforeNote: form.screenshotBeforeNote,
      screenshotAfterNote: form.screenshotAfterNote,
    };
  };

  const buildPayload = (acceptGuardrailOverride = false) => {
    const tradePayload = buildTradePayload(acceptGuardrailOverride);
    const data = new FormData();

    Object.entries(tradePayload).forEach(([field, value]) => {
      if (field.endsWith("Name")) {
        return;
      }

      if (value === undefined || value === null) {
        return;
      }

      data.append(field, value);
    });

    if (form.screenshotBefore) {
      data.append("screenshotBefore", form.screenshotBefore);
    }
    if (form.screenshotAfter) {
      data.append("screenshotAfter", form.screenshotAfter);
    }

    return data;
  };

  const submitTrade = async (acceptGuardrailOverride = false) => {
    const normalizedPair = String(form.pair || "")
      .toUpperCase()
      .replace(/\s+/g, "");
    if (!normalizedPair || normalizedPair.length < 3 || normalizedPair.length > 15) {
      setError("Pair is required and should be 3-15 characters.");
      return;
    }

    if (hasCriticalPreTradeAlert && !acceptGuardrailOverride) {
      setChecklistWarnings(
        preTradeAlerts
          .filter((alert) => alert.level === "critical")
          .map((alert) => alert.message)
      );
      setError("Risk guardrail blocked this save. Review warnings or use override.");
      return;
    }

    if (
      activeRiskControls.strictChecklistGate &&
      !checklistAligned &&
      !acceptGuardrailOverride &&
      !String(form.ruleBreakReason || "").trim()
    ) {
      setChecklistWarnings([
        "Checklist gate active: setup must be Asia HL + POC + clean, or include override reason.",
      ]);
      setError("Checklist gate blocked this save. Add a reason or use override.");
      return;
    }

    setIsSubmitting(true);
    setError("");

    try {
      const payload = buildPayload(acceptGuardrailOverride);
      const savedTrade = await createTrade(payload, token);
      persistLastStructure();
      onTradeSaved({
        mode: "online",
        trade: savedTrade,
      });

      const warnings = savedTrade?.guardrails?.warnings || [];
      if (warnings.length) {
        setSuccessWarning(`Saved with warnings: ${warnings.join(" | ")}`);
      } else {
        setSuccessWarning("");
      }

      setChecklistWarnings([]);
      setGuardrailWarnings([]);
      resetTradeForm();
    } catch (submitError) {
      if (submitError.code === "CHECKLIST_GATE_REQUIRED") {
        setChecklistWarnings([
          submitError.message || "Checklist gate active. Confirm override to save this trade.",
        ]);
        setError("Checklist gate requires explicit override.");
      } else if (submitError.code === "GUARDRAIL_CONFIRMATION_REQUIRED") {
        const warnings = submitError.payload?.guardrails?.warnings || [];
        setGuardrailWarnings(warnings);
        setError("Guardrail warning detected. Review and confirm to save this trade.");
      } else if (isNetworkError(submitError) || !navigator.onLine) {
        const tradePayload = buildTradePayload(true);
        const queuedTrade = await queueTradeOffline({
          ...tradePayload,
          asiaHighLowUsed: tradePayload.asiaHighLowUsed === "true",
          pocInteraction: tradePayload.pocInteraction === "true",
          cleanSetup: tradePayload.cleanSetup === "true",
          screenshotBeforeFile: form.screenshotBefore,
          screenshotAfterFile: form.screenshotAfter,
        });
        persistLastStructure();

        onTradeSaved({
          mode: "offline",
          trade: queuedTrade.displayTrade,
        });

        setChecklistWarnings([]);
        setGuardrailWarnings([]);
        setError("");
        setSuccessWarning("Saved offline. It will sync automatically when internet returns.");
        resetTradeForm();
      } else {
        setError(submitError.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    await submitTrade(false);
  };

  useEffect(() => {
    const onSaveRequest = () => {
      formRef.current?.requestSubmit();
    };

    const onNewRequest = () => {
      setError("");
      setChecklistWarnings([]);
      setGuardrailWarnings([]);
      setSuccessWarning("");
      resetTradeForm();
    };

    window.addEventListener("journal-save-request", onSaveRequest);
    window.addEventListener("journal-new-request", onNewRequest);

    return () => {
      window.removeEventListener("journal-save-request", onSaveRequest);
      window.removeEventListener("journal-new-request", onNewRequest);
    };
  }, [resetTradeForm]);

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <h2 className="text-base font-semibold">Trade Entry</h2>
          <div className="flex flex-wrap items-center gap-2">
            <span className="chip">Log in under 60s</span>
            <span className="chip">Ctrl+Enter to save</span>
            <span className="chip">
              Quality {qualityAssessment.grade} ({qualityAssessment.score})
            </span>
          </div>
        </div>

        <div className="rounded-xl border border-border bg-panelMuted p-2 text-xs text-textMuted">
          <p className="font-medium text-textMain">{qualityAssessment.tip}</p>
          <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-panel">
            <div
              className="h-full rounded-full bg-accent transition-all duration-300"
              style={{ width: `${qualityAssessment.score}%` }}
            />
          </div>
          {qualityAssessment.notes.length ? (
            <p className="mt-1">{qualityAssessment.notes.join(" | ")}</p>
          ) : null}
        </div>

        {savedDraft?.savedAt ? (
          <div className="rounded-xl border border-border bg-panelMuted p-2 text-xs text-textMuted">
            <p>
              Draft available from {new Date(savedDraft.savedAt).toLocaleString([], { month: "short", day: "2-digit", hour: "2-digit", minute: "2-digit" })}.
            </p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="chip text-textMain transition hover:border-accent"
                onClick={restoreSavedDraft}
              >
                Restore draft
              </button>
              <button
                type="button"
                className="chip text-textMain transition hover:border-danger"
                onClick={clearSavedDraft}
              >
                Discard draft
              </button>
            </div>
          </div>
        ) : null}

        {preTradeAlerts.length ? (
          <div
            className={`rounded-xl border p-2 text-xs ${
              hasCriticalPreTradeAlert
                ? "border-danger/45 bg-danger/10 text-danger"
                : "border-amber-400/40 bg-amber-500/10 text-amber-200"
            }`}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide">
              {hasCriticalPreTradeAlert ? "Critical Guardrail Alert" : "Guardrail Caution"}
            </p>
            {preTradeAlerts.map((alert) => (
              <p key={alert.id} className="mt-1">
                {alert.message}
              </p>
            ))}
            {!hasCriticalPreTradeAlert ? (
              <p className="mt-1 text-[11px] opacity-80">These warnings update live while you type.</p>
            ) : null}
            {hasCriticalPreTradeAlert ? (
              <p className="mt-1 text-[11px] opacity-80">
                Save is blocked until conditions improve, unless you explicitly override.
              </p>
            ) : null}
          </div>
        ) : (
          <div className="rounded-xl border border-border bg-panelMuted p-2 text-xs text-textMuted">
            No active guardrail alerts.
          </div>
        )}

        <div className="rounded-xl border border-border bg-panelMuted p-2 text-xs text-textMuted">
          Coach:
          {" "}
          {qualityAssessment.grade === "A+" || qualityAssessment.grade === "A"
            ? "A-grade setup. Keep execution clean and stick to your plan."
            : "Wait for cleaner context if this setup is not fully aligned."}
        </div>
        <div className="rounded-xl border border-border bg-panelMuted p-2 text-xs text-textMuted">
          Guardrails:
          {" "}
          Max/session {activeRiskControls.maxTradesPerSession}
          {" | "}
          Cooldown {activeRiskControls.cooldownMinutesAfterLoss}m
          {" | "}
          Stop day {-Math.abs(activeRiskControls.stopForDayLossRR)} RR
          {" | "}
          Checklist gate {activeRiskControls.strictChecklistGate ? "On" : "Off"}
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          <input
            className="input min-w-[220px] flex-1"
            placeholder="Preset name (e.g., Asia Reversal)"
            value={presetName}
            onChange={(event) => setPresetName(event.target.value)}
          />
          <button type="button" className="btn-primary !px-3 !py-1 text-xs" onClick={handleSavePreset}>
            Save preset
          </button>
          <button
            type="button"
            className="chip text-textMain transition hover:border-accent"
            onClick={handleApplyLastStructure}
            disabled={!lastStructure}
          >
            Repeat last
          </button>
        </div>
        <div className="flex flex-wrap gap-2 text-xs">
          {QUICK_ENTRY_TEMPLATES.map((template) => (
            <button
              key={template.id}
              type="button"
              className="chip text-textMain transition hover:border-accent"
              onClick={() => handleQuickTemplate(template)}
            >
              {template.label}
            </button>
          ))}
        </div>
        {presets.length ? (
          <div className="flex flex-wrap gap-2 text-xs">
            {presets.map((preset) => (
              <div
                key={preset.label}
                className="chip flex items-center gap-1 rounded-full border border-border bg-panelMuted px-2 py-0.5"
              >
                <span>{preset.label}</span>
                <button
                  type="button"
                  className="text-textMuted underline underline-offset-2"
                  onClick={() => handleApplyPreset(preset)}
                >
                  apply
                </button>
                <button type="button" className="text-danger" onClick={() => handleRemovePreset(preset.label)}>
                  x
                </button>
              </div>
            ))}
          </div>
        ) : null}
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Pair">
          <div>
            <select
              className="input"
              value={form.pair}
              onChange={(event) => handleChange("pair", event.target.value)}
            >
              {optionLists.pairs.map((pair) => (
                <option key={pair} value={pair}>
                  {pair}
                </option>
              ))}
            </select>
          </div>
        </Field>

        <Field label="Date & Time">
          <div className="flex gap-2">
            <input
              className="input"
              type="datetime-local"
              value={form.tradeDate}
              onChange={(event) => handleChange("tradeDate", event.target.value)}
            />
            <button type="button" className="chip border-none" onClick={() => handleChange("tradeDate", localNow())}>
              Now
            </button>
          </div>
        </Field>

        <Field label="Exit Time (Optional)">
          <input
            className="input"
            type="datetime-local"
            value={form.exitTime}
            onChange={(event) => handleChange("exitTime", event.target.value)}
          />
        </Field>

        <Field label="Session">
          <div>
            <input
              className="input"
              list="session-options"
              value={form.session}
              onChange={(event) => handleChange("session", event.target.value)}
              placeholder="Type session name"
            />
            <datalist id="session-options">
              {optionLists.sessions.map((session) => (
                <option key={session} value={session} />
              ))}
            </datalist>
          </div>
        </Field>

        <Field label="Trade Type">
          <div>
            <input
              className="input"
              list="trade-type-options"
              value={form.tradeType}
              onChange={(event) => handleChange("tradeType", event.target.value)}
              placeholder="Type buy, sell, etc."
            />
            <datalist id="trade-type-options">
              {optionLists.tradeTypes.map((tradeType) => (
                <option key={tradeType} value={tradeType} />
              ))}
            </datalist>
          </div>
        </Field>

        <Field label="Setup Type">
          <div>
            <input
              className="input"
              list="setup-options"
              value={form.setupType}
              onChange={(event) => handleChange("setupType", event.target.value)}
              placeholder="Type setup"
            />
            <datalist id="setup-options">
              {optionLists.setupTypes.map((setupType) => (
                <option key={setupType} value={setupType} />
              ))}
            </datalist>
          </div>
        </Field>

        <Field label="Result">
          <div>
            <input
              className="input"
              list="result-options"
              value={form.result}
              onChange={(event) => handleChange("result", event.target.value)}
              placeholder="Win, loss, BE, etc."
            />
            <datalist id="result-options">
              {optionLists.results.map((result) => (
                <option key={result} value={result} />
              ))}
            </datalist>
            {derivedResult ? (
              <p className="mt-1 text-[11px] text-textMuted">
                Auto-detected from exit price: {derivedResult}
              </p>
            ) : null}
          </div>
        </Field>

        <Field label="Entry Price">
          <input
            className="input"
            type="number"
            required
            step="0.00001"
            value={form.entryPrice}
            onChange={(event) => handleChange("entryPrice", event.target.value)}
          />
        </Field>

        <Field label="Exit Price (Optional)">
          <input
            className="input"
            type="number"
            step="0.00001"
            value={form.exitPrice}
            onChange={(event) => handleChange("exitPrice", event.target.value)}
          />
        </Field>

        <Field label="Stop Loss">
          <input
            className="input"
            type="number"
            required
            step="0.00001"
            value={form.stopLoss}
            onChange={(event) => handleChange("stopLoss", event.target.value)}
          />
        </Field>

        <Field label="Take Profit">
          <input
            className="input"
            type="number"
            required
            step="0.00001"
            value={form.takeProfit}
            onChange={(event) => handleChange("takeProfit", event.target.value)}
          />
        </Field>

        <Field label="Risk %">
          <input
            className="input"
            type="number"
            step="0.1"
            min="0"
            value={form.riskPercent}
            onChange={(event) => handleChange("riskPercent", event.target.value)}
          />
        </Field>

        <Field label="Planned RR">
          <input className="input" readOnly value={plannedRR} />
        </Field>

        <Field label="RR Achieved (Auto)">
          <input className="input" readOnly value={achievedRR} />
        </Field>

        <div className="col-span-full rounded-xl border border-border bg-panelMuted p-3">
          <div className="mb-2 flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-textMuted">Lot Size (Optional)</span>
            <label className="flex items-center gap-2 text-xs text-textMuted">
              <input
                type="checkbox"
                checked={autoLotSize}
                onChange={(event) => setAutoLotSize(event.target.checked)}
              />
              Auto-calc
            </label>
          </div>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
            <Field label="Account Balance">
              <input
                className="input"
                type="number"
                min="0"
                value={accountBalance}
                onChange={(event) => setAccountBalance(event.target.value)}
              />
            </Field>
            <Field label="Pip Value / Lot">
              <input
                className="input"
                type="number"
                min="0"
                step="0.1"
                value={pipValuePerLot}
                onChange={(event) => setPipValuePerLot(event.target.value)}
              />
            </Field>
            <Field label="Suggested Lot Size">
              <input className="input" readOnly value={computedLotSize} />
            </Field>
            <Field label="Final Lot Size">
              <input
                className="input"
                type="number"
                min="0"
                step="0.01"
                readOnly={autoLotSize}
                value={autoLotSize ? computedLotSize : form.lotSize}
                onChange={(event) => handleChange("lotSize", event.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="col-span-full rounded-xl border border-border bg-panelMuted p-3">
          <h3 className="mb-2 text-sm font-semibold">Strategy Tags</h3>
          <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <Field label="Asia High/Low Used">
              <select
                className="input"
                value={form.asiaHighLowUsed}
                onChange={(event) => handleChange("asiaHighLowUsed", event.target.value)}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </Field>

            <Field label="POC Interaction">
              <select
                className="input"
                value={form.pocInteraction}
                onChange={(event) => handleChange("pocInteraction", event.target.value)}
              >
                <option value="true">Yes</option>
                <option value="false">No</option>
              </select>
            </Field>

            <Field label="Acceptance / Rejection">
              <div>
                <input
                  className="input"
                  list="poc-options"
                  value={form.pocOutcome}
                  onChange={(event) => handleChange("pocOutcome", event.target.value)}
                  disabled={form.pocInteraction === "false"}
                />
                <datalist id="poc-options">
                  {optionLists.pocOutcomes.map((option) => (
                    <option key={option} value={option} />
                  ))}
                </datalist>
              </div>
            </Field>

            <label className="mt-4 flex items-center gap-2 text-sm text-textMain">
              <input
                type="checkbox"
                checked={form.cleanSetup}
                onChange={(event) => handleChange("cleanSetup", event.target.checked)}
              />
              Clean setup (A+ only)
            </label>
          </div>

          {requiresRuleBreakReason ? (
            <div className="mt-3">
              <Field label="Rule-break reason (required when not fully aligned)">
                <textarea
                  className="input min-h-20"
                  value={form.ruleBreakReason}
                  onChange={(event) => handleChange("ruleBreakReason", event.target.value)}
                  placeholder="Why did you take this trade outside your core rules?"
                  required={activeRiskControls.requireRuleAlignment}
                />
              </Field>
            </div>
          ) : null}
        </div>

        <div className="col-span-full rounded-xl border border-border bg-panelMuted p-3">
          <h3 className="mb-2 text-sm font-semibold">Notes</h3>
          <div className="grid grid-cols-1 gap-3">
            <Field label="What did price do?">
              <textarea
                className="input min-h-20"
                value={form.priceAction}
                onChange={(event) => handleChange("priceAction", event.target.value)}
              />
            </Field>
            <Field label="What did I do right/wrong?">
              <textarea
                className="input min-h-20"
                value={form.executionReview}
                onChange={(event) => handleChange("executionReview", event.target.value)}
              />
            </Field>
            <Field label="Emotional state">
              <input
                className="input"
                placeholder="calm, rushed, FOMO..."
                value={form.emotionalState}
                onChange={(event) => handleChange("emotionalState", event.target.value)}
              />
            </Field>
          </div>
        </div>

        <div className="col-span-full grid grid-cols-1 gap-3 md:grid-cols-2">
          <ScreenshotField
            label="Screenshot (Before)"
            file={form.screenshotBefore}
            note={form.screenshotBeforeNote}
            onFileChange={(file) => {
              void handleScreenshotChange("screenshotBefore", file);
            }}
            onNoteChange={(value) => handleChange("screenshotBeforeNote", value)}
          />
          <ScreenshotField
            label="Screenshot (After)"
            file={form.screenshotAfter}
            note={form.screenshotAfterNote}
            onFileChange={(file) => {
              void handleScreenshotChange("screenshotAfter", file);
            }}
            onNoteChange={(value) => handleChange("screenshotAfterNote", value)}
          />
        </div>
        {mediaOptimizationMessage ? (
          <p className="col-span-full rounded-xl border border-border bg-panelMuted p-2 text-xs text-textMuted">
            {mediaOptimizationMessage}
          </p>
        ) : null}

        {checklistWarnings.length ? (
          <div className="col-span-full rounded-xl border border-danger/40 bg-danger/10 p-3">
            <p className="text-xs uppercase tracking-wide text-danger">Checklist Gate</p>
            <ul className="mt-2 list-disc pl-4 text-sm text-danger">
              {checklistWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-primary mt-3"
              onClick={() => submitTrade(true)}
              disabled={isSubmitting}
            >
              Save with override
            </button>
          </div>
        ) : null}

        {guardrailWarnings.length ? (
          <div className="col-span-full rounded-xl border border-border bg-panelMuted p-3">
            <p className="text-xs uppercase tracking-wide text-textMuted">Guardrail warnings</p>
            <ul className="mt-2 list-disc pl-4 text-sm text-textMain">
              {guardrailWarnings.map((warning) => (
                <li key={warning}>{warning}</li>
              ))}
            </ul>
            <button
              type="button"
              className="btn-primary mt-3"
              onClick={() => submitTrade(true)}
              disabled={isSubmitting}
            >
              Save anyway (confirm override)
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="col-span-full rounded-xl border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {successWarning ? (
          <p className="col-span-full rounded-xl border border-border bg-panelMuted p-2 text-sm text-textMuted">
            {successWarning}
          </p>
        ) : null}

        <button className="btn-primary col-span-full" disabled={isSubmitting} type="submit">
          {isSubmitting ? "Saving trade..." : "Save Trade"}
        </button>
      </form>
    </section>
  );
};

export default memo(TradeEntryForm);
