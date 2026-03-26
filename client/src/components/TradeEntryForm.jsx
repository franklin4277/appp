import { useEffect, useMemo, useRef, useState } from "react";
import { createTrade } from "../api/tradesApi";
import {
  POC_OUTCOMES,
  PAIRS,
  RESULTS,
  SESSIONS,
  SETUP_TYPES,
  TRADE_TYPES,
} from "../utils/options";
import {
  calculateAchievedRR,
  calculateLotSize,
  calculatePlannedRR,
  round,
} from "../utils/tradeMath";

const localNow = () => {
  const date = new Date();
  const offset = date.getTimezoneOffset();
  return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
};

const initialState = {
  pair: "EURUSD",
  tradeDate: localNow(),
  session: "London",
  tradeType: "Buy",
  setupType: "Asia Break -> Continuation",
  entryPrice: "",
  stopLoss: "",
  takeProfit: "",
  riskPercent: "1",
  lotSize: "",
  result: "Win",
  asiaHighLowUsed: "true",
  pocInteraction: "true",
  pocOutcome: "Acceptance",
  cleanSetup: false,
  priceAction: "",
  executionReview: "",
  emotionalState: "",
  screenshotBefore: null,
  screenshotAfter: null,
};

const Field = ({ label, children }) => (
  <label>
    <span className="label">{label}</span>
    {children}
  </label>
);

const TradeEntryForm = ({ onTradeSaved }) => {
  const [form, setForm] = useState(initialState);
  const [accountBalance, setAccountBalance] = useState("10000");
  const [pipValuePerLot, setPipValuePerLot] = useState("10");
  const [autoLotSize, setAutoLotSize] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState("");
  const formRef = useRef(null);

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

  useEffect(() => {
    const onKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
        formRef.current?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const handleChange = (field, value) => {
    setForm((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSubmit = async (event) => {
    event.preventDefault();
    setIsSubmitting(true);
    setError("");

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
    data.append("priceAction", form.priceAction);
    data.append("executionReview", form.executionReview);
    data.append("emotionalState", form.emotionalState);

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

    try {
      const savedTrade = await createTrade(data);
      onTradeSaved(savedTrade);
      setForm((prev) => ({
        ...prev,
        tradeDate: localNow(),
        entryPrice: "",
        stopLoss: "",
        takeProfit: "",
        result: "Win",
        lotSize: "",
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
      setError(submitError.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-base font-semibold">Trade Entry</h2>
        <span className="chip">Ctrl+Enter to save</span>
      </div>

      <form ref={formRef} onSubmit={handleSubmit} className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Field label="Pair">
          <select
            className="input"
            value={form.pair}
            onChange={(event) => handleChange("pair", event.target.value)}
          >
            {PAIRS.map((pair) => (
              <option key={pair} value={pair}>
                {pair}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Date & Time">
          <div className="flex gap-2">
            <input
              className="input"
              type="datetime-local"
              value={form.tradeDate}
              onChange={(event) => handleChange("tradeDate", event.target.value)}
            />
            <button
              type="button"
              className="chip border-none"
              onClick={() => handleChange("tradeDate", localNow())}
            >
              Now
            </button>
          </div>
        </Field>

        <Field label="Session">
          <select
            className="input"
            value={form.session}
            onChange={(event) => handleChange("session", event.target.value)}
          >
            {SESSIONS.map((session) => (
              <option key={session} value={session}>
                {session}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Trade Type">
          <select
            className="input"
            value={form.tradeType}
            onChange={(event) => handleChange("tradeType", event.target.value)}
          >
            {TRADE_TYPES.map((tradeType) => (
              <option key={tradeType} value={tradeType}>
                {tradeType}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Setup Type">
          <select
            className="input"
            value={form.setupType}
            onChange={(event) => handleChange("setupType", event.target.value)}
          >
            {SETUP_TYPES.map((setupType) => (
              <option key={setupType} value={setupType}>
                {setupType}
              </option>
            ))}
          </select>
        </Field>

        <Field label="Result">
          <select
            className="input"
            value={form.result}
            onChange={(event) => handleChange("result", event.target.value)}
          >
            {RESULTS.map((result) => (
              <option key={result} value={result}>
                {result}
              </option>
            ))}
          </select>
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
            <span className="text-xs font-medium uppercase tracking-wide text-textMuted">
              Lot Size (Optional)
            </span>
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
              <select
                className="input"
                value={form.pocOutcome}
                onChange={(event) => handleChange("pocOutcome", event.target.value)}
                disabled={form.pocInteraction === "false"}
              >
                {POC_OUTCOMES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
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

        {error ? (
          <p className="col-span-full rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">
            {error}
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
