import { useEffect, useMemo, useRef, useState } from "react";
import { createTrade } from "../api/tradesApi";
import { POC_OUTCOMES, PAIRS, RESULTS, SESSIONS, SETUP_TYPES, TRADE_TYPES } from "../utils/options";
import { calculateAchievedRR, calculateLotSize, calculatePlannedRR, round } from "../utils/tradeMath";

const PRESET_STORAGE_KEY = "trading-journal-presets";

const localNow = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
};

const buildOptionLists = (settings = {}) => ({
  pairs: settings?.options?.pairs?.length ? settings.options.pairs : PAIRS,
  sessions: settings?.options?.sessions?.length ? settings.options.sessions : SESSIONS,
  setupTypes: settings?.options?.setupTypes?.length ? settings.options.setupTypes : SETUP_TYPES,
  tradeTypes: settings?.options?.tradeTypes?.length ? settings.options.tradeTypes : TRADE_TYPES,
  results: settings?.options?.results?.length ? settings.options.results : RESULTS,
  pocOutcomes: settings?.options?.pocOutcomes?.length ? settings.options.pocOutcomes : POC_OUTCOMES,
});

const buildInitialState = (options) => ({
  pair: options.pairs[0] || "EURUSD",
  tradeDate: localNow(),
  session: options.sessions[0] || "London",
  tradeType: options.tradeTypes[0] || "Buy",
  setupType: options.setupTypes[0] || "Asia Break -> Continuation",
  entryPrice: "",
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
});

const Field = ({ label, children }) => (
  <label>
    <span className="label">{label}</span>
    {children}
  </label>
);

const TradeEntryForm = ({ onTradeSaved, token, settings }) => {
  const optionLists = useMemo(() => buildOptionLists(settings), [settings]);
  const [form, setForm] = useState(() => buildInitialState(optionLists));
  const [accountBalance, setAccountBalance] = useState("10000");
  const [pipValuePerLot, setPipValuePerLot] = useState("10");
  const [autoLotSize, setAutoLotSize] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [presets, setPresets] = useState([]);
  const [presetName, setPresetName] = useState("");
  const [guardrailWarnings, setGuardrailWarnings] = useState([]);
  const [successWarning, setSuccessWarning] = useState("");
  const formRef = useRef(null);

  const activeRiskControls = settings?.riskControls || {
    requireRuleAlignment: true,
    maxTradesPerSession: 4,
    cooldownMinutesAfterLoss: 30,
    stopForDayLossRR: 3,
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

  const achievedRR = useMemo(() => calculateAchievedRR(plannedRR, form.result), [plannedRR, form.result]);

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
    setForm((prev) => ({
      ...prev,
      pair: prev.pair || optionLists.pairs[0] || "",
      session: prev.session || optionLists.sessions[0] || "",
      tradeType: prev.tradeType || optionLists.tradeTypes[0] || "",
      setupType: prev.setupType || optionLists.setupTypes[0] || "",
      result: prev.result || optionLists.results[0] || "",
      pocOutcome: prev.pocOutcome || optionLists.pocOutcomes[0] || "",
    }));
  }, [optionLists]);

  const persistPresets = (next) => {
    setPresets(next);
    localStorage.setItem(PRESET_STORAGE_KEY, JSON.stringify(next));
  };

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

  const handleChange = (field, value) => {
    setError("");
    setGuardrailWarnings([]);
    setSuccessWarning("");
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const buildPayload = (acceptGuardrailOverride = false) => {
    const data = new FormData();
    data.append("pair", form.pair);
    data.append(
      "tradeDate",
      form.tradeDate ? new Date(form.tradeDate).toISOString() : new Date().toISOString()
    );
    data.append("session", form.session);
    data.append("tradeType", form.tradeType);
    data.append("setupType", form.setupType);
    data.append("entryPrice", form.entryPrice);
    data.append("stopLoss", form.stopLoss);
    data.append("takeProfit", form.takeProfit);
    data.append("riskPercent", form.riskPercent);
    data.append("result", form.result);
    data.append("rrAchieved", String(achievedRR));
    data.append("asiaHighLowUsed", form.asiaHighLowUsed);
    data.append("pocInteraction", form.pocInteraction);
    data.append("pocOutcome", form.pocInteraction === "true" ? form.pocOutcome : "");
    data.append("cleanSetup", String(form.cleanSetup));
    data.append("ruleBreakReason", form.ruleBreakReason);
    data.append("priceAction", form.priceAction);
    data.append("executionReview", form.executionReview);
    data.append("emotionalState", form.emotionalState);
    data.append("acceptGuardrailOverride", String(acceptGuardrailOverride));

    const lotSizeToSave = autoLotSize ? computedLotSize : Number(form.lotSize || 0);
    if (lotSizeToSave > 0) {
      data.append("lotSize", String(round(lotSizeToSave, 2)));
    }

    if (form.screenshotBefore) {
      data.append("screenshotBefore", form.screenshotBefore);
    }
    if (form.screenshotAfter) {
      data.append("screenshotAfter", form.screenshotAfter);
    }

    return data;
  };

  const submitTrade = async (acceptGuardrailOverride = false) => {
    setIsSubmitting(true);
    setError("");

    try {
      const payload = buildPayload(acceptGuardrailOverride);
      const savedTrade = await createTrade(payload, token);
      onTradeSaved(savedTrade);

      const warnings = savedTrade?.guardrails?.warnings || [];
      if (warnings.length) {
        setSuccessWarning(`Saved with warnings: ${warnings.join(" | ")}`);
      } else {
        setSuccessWarning("");
      }

      setGuardrailWarnings([]);
      setForm((prev) => ({
        ...prev,
        tradeDate: localNow(),
        entryPrice: "",
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
      }));
      if (formRef.current) {
        formRef.current.reset();
      }
    } catch (submitError) {
      if (submitError.code === "GUARDRAIL_CONFIRMATION_REQUIRED") {
        const warnings = submitError.payload?.guardrails?.warnings || [];
        setGuardrailWarnings(warnings);
        setError("Guardrail warning detected. Review and confirm to save this trade.");
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

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold">Trade Entry</h2>
          <span className="chip">Ctrl+Enter to save</span>
        </div>
        <div className="rounded-md border border-border bg-panelMuted p-2 text-xs text-textMuted">
          Guardrails:
          {" "}
          Max/session {activeRiskControls.maxTradesPerSession}
          {" | "}
          Cooldown {activeRiskControls.cooldownMinutesAfterLoss}m
          {" | "}
          Stop day {-Math.abs(activeRiskControls.stopForDayLossRR)} RR
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
            <input
              className="input"
              list="pair-options"
              value={form.pair}
              onChange={(event) => handleChange("pair", event.target.value)}
              placeholder="Type or pick a pair"
            />
            <datalist id="pair-options">
              {optionLists.pairs.map((pair) => (
                <option key={pair} value={pair} />
              ))}
            </datalist>
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

        <div className="col-span-full rounded-md border border-border bg-panelMuted p-3">
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

        <div className="col-span-full rounded-md border border-border bg-panelMuted p-3">
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

        <div className="col-span-full rounded-md border border-border bg-panelMuted p-3">
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

        <Field label="Screenshot (Before)">
          <input
            className="input"
            type="file"
            accept="image/*"
            onChange={(event) => handleChange("screenshotBefore", event.target.files?.[0] || null)}
          />
        </Field>

        <Field label="Screenshot (After)">
          <input
            className="input"
            type="file"
            accept="image/*"
            onChange={(event) => handleChange("screenshotAfter", event.target.files?.[0] || null)}
          />
        </Field>

        {guardrailWarnings.length ? (
          <div className="col-span-full rounded-md border border-border bg-panelMuted p-3">
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
          <p className="col-span-full rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
            {error}
          </p>
        ) : null}
        {successWarning ? (
          <p className="col-span-full rounded-md border border-border bg-panelMuted p-2 text-sm text-textMuted">
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

export default TradeEntryForm;
