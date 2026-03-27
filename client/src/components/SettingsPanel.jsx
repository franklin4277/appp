import { useEffect, useMemo, useState } from "react";
import { updateUserSettings } from "../api/tradesApi";

const toCsv = (value = []) => value.join(", ");
const fromCsv = (value = "") =>
  String(value)
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean);

const SettingField = ({ label, value, onChange, placeholder }) => (
  <label>
    <span className="label">{label}</span>
    <input className="input" value={value} onChange={onChange} placeholder={placeholder} />
  </label>
);

const SettingsPanel = ({ user, token, onUserUpdate, onSaved }) => {
  const initial = useMemo(
    () => ({
      pairs: toCsv(user?.settings?.options?.pairs || []),
      sessions: toCsv(user?.settings?.options?.sessions || []),
      setupTypes: toCsv(user?.settings?.options?.setupTypes || []),
      tradeTypes: toCsv(user?.settings?.options?.tradeTypes || []),
      results: toCsv(user?.settings?.options?.results || []),
      pocOutcomes: toCsv(user?.settings?.options?.pocOutcomes || []),
      emotionTags: toCsv(user?.settings?.options?.emotionTags || []),
      requireRuleAlignment: Boolean(user?.settings?.riskControls?.requireRuleAlignment),
      maxTradesPerSession: user?.settings?.riskControls?.maxTradesPerSession ?? 4,
      cooldownMinutesAfterLoss: user?.settings?.riskControls?.cooldownMinutesAfterLoss ?? 30,
      stopForDayLossRR: user?.settings?.riskControls?.stopForDayLossRR ?? 3,
    }),
    [user]
  );

  const [state, setState] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setState(initial);
  }, [initial]);

  const onChange = (field, value) => {
    setSaved(false);
    setState((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    setSaved(false);
    setError("");

    try {
      const payload = {
        options: {
          pairs: fromCsv(state.pairs),
          sessions: fromCsv(state.sessions),
          setupTypes: fromCsv(state.setupTypes),
          tradeTypes: fromCsv(state.tradeTypes),
          results: fromCsv(state.results),
          pocOutcomes: fromCsv(state.pocOutcomes),
          emotionTags: fromCsv(state.emotionTags),
        },
        riskControls: {
          requireRuleAlignment: state.requireRuleAlignment,
          maxTradesPerSession: Number(state.maxTradesPerSession) || 0,
          cooldownMinutesAfterLoss: Number(state.cooldownMinutesAfterLoss) || 0,
          stopForDayLossRR: Number(state.stopForDayLossRR) || 0,
        },
      };

      const response = await updateUserSettings(token, payload);
      onUserUpdate(response.user);
      setSaved(true);
      if (typeof onSaved === "function") {
        onSaved(response.user);
      }
    } catch (saveError) {
      setError(saveError.message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-sm font-semibold">Account Settings</h3>
        {saved ? <span className="chip">Saved</span> : <span className="chip">Per-user config</span>}
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <SettingField
          label="Pairs"
          value={state.pairs}
          onChange={(event) => onChange("pairs", event.target.value)}
          placeholder="EURUSD, GBPUSD, ..."
        />
        <SettingField
          label="Sessions"
          value={state.sessions}
          onChange={(event) => onChange("sessions", event.target.value)}
          placeholder="Asia, London, New York"
        />
        <SettingField
          label="Setup Types"
          value={state.setupTypes}
          onChange={(event) => onChange("setupTypes", event.target.value)}
          placeholder="Continuation, Reversal, ..."
        />
        <SettingField
          label="Trade Types"
          value={state.tradeTypes}
          onChange={(event) => onChange("tradeTypes", event.target.value)}
          placeholder="Buy, Sell"
        />
        <SettingField
          label="Results"
          value={state.results}
          onChange={(event) => onChange("results", event.target.value)}
          placeholder="Win, Loss, BE"
        />
        <SettingField
          label="POC Outcomes"
          value={state.pocOutcomes}
          onChange={(event) => onChange("pocOutcomes", event.target.value)}
          placeholder="Acceptance, Rejection"
        />
        <SettingField
          label="Emotion Tags"
          value={state.emotionTags}
          onChange={(event) => onChange("emotionTags", event.target.value)}
          placeholder="calm, rushed, FOMO"
        />
      </div>

      <div className="mt-3 grid grid-cols-1 gap-3 rounded-md border border-border bg-panelMuted p-3 md:grid-cols-4">
        <label className="flex items-center gap-2 text-sm text-textMain md:col-span-2">
          <input
            type="checkbox"
            checked={state.requireRuleAlignment}
            onChange={(event) => onChange("requireRuleAlignment", event.target.checked)}
          />
          Require rule alignment or reason
        </label>
        <label>
          <span className="label">Max trades/session</span>
          <input
            className="input"
            type="number"
            min="0"
            value={state.maxTradesPerSession}
            onChange={(event) => onChange("maxTradesPerSession", event.target.value)}
          />
        </label>
        <label>
          <span className="label">Cooldown (min)</span>
          <input
            className="input"
            type="number"
            min="0"
            value={state.cooldownMinutesAfterLoss}
            onChange={(event) => onChange("cooldownMinutesAfterLoss", event.target.value)}
          />
        </label>
        <label>
          <span className="label">Stop-for-day RR</span>
          <input
            className="input"
            type="number"
            min="0"
            step="0.1"
            value={state.stopForDayLossRR}
            onChange={(event) => onChange("stopForDayLossRR", event.target.value)}
          />
        </label>
      </div>

      {error ? <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p> : null}

      <button type="button" className="btn-primary mt-3" onClick={handleSave} disabled={loading}>
        {loading ? "Saving..." : "Save settings"}
      </button>
    </section>
  );
};

export default SettingsPanel;
