import { useEffect, useMemo, useState } from "react";
import { disableMt5Bridge, generateMt5BridgeKey, updateUserSettings } from "../api/tradesApi";
import { PAIRS, SESSIONS, SETUP_TYPES, TRADE_TYPES } from "../utils/options";

const toCsv = (value = []) => value.join(", ");
const fromCsv = (value = "") =>
  String(value)
    .split(/[\n,]/g)
    .map((item) => item.trim())
    .filter(Boolean);

const normalizeBaseUrl = (value = "") => String(value || "").trim().replace(/\/+$/, "").replace(/\/api$/i, "");
const normalizePairs = (value = "") => {
  const raw = fromCsv(value).map((pair) =>
    String(pair || "")
      .toUpperCase()
      .replace(/[^A-Z0-9]/g, "")
  );
  const filtered = raw.filter((pair) => pair.length >= 3 && pair.length <= 15);
  return filtered.length ? filtered : PAIRS;
};

const normalizeNamedList = (value = "", maxLength, fallback = []) => {
  const raw = fromCsv(value).map((item) => String(item || "").trim());
  const filtered = raw.filter((item) => item.length > 0 && item.length <= maxLength);
  return filtered.length ? filtered : fallback;
};

const normalizeTradeTypes = (value = "") => {
  const raw = fromCsv(value)
    .map((item) => String(item || "").trim().toLowerCase())
    .map((item) => {
      if (item.startsWith("buy")) return "Buy";
      if (item.startsWith("sell")) return "Sell";
      return "";
    })
    .filter(Boolean);
  const unique = [...new Set(raw)];
  return unique.length ? unique : TRADE_TYPES;
};

const formatDateTime = (value = "") => {
  if (!value) {
    return "";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "";
  }
  return date.toLocaleString([], {
    month: "short",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
};

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
      strictChecklistGate: Boolean(user?.settings?.riskControls?.strictChecklistGate),
    }),
    [user]
  );

  const [state, setState] = useState(initial);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState("");
  const [bridgeBusy, setBridgeBusy] = useState(false);
  const [bridgeError, setBridgeError] = useState("");
  const [bridgeMessage, setBridgeMessage] = useState("");
  const [bridgeKey, setBridgeKey] = useState("");
  const [bridgeLabel, setBridgeLabel] = useState(() => user?.integrations?.mt5?.label || "MT5 Bridge");
  const mt5Integration = user?.integrations?.mt5 || {};
  const backendBase = useMemo(
    () => normalizeBaseUrl(import.meta.env.VITE_API_URL || window.location.origin),
    []
  );
  const bridgeEndpoint = `${backendBase}/api/trades/bridge/mt5`;

  useEffect(() => {
    setState(initial);
  }, [initial]);

  useEffect(() => {
    setBridgeLabel(user?.integrations?.mt5?.label || "MT5 Bridge");
  }, [user?.integrations?.mt5?.label]);

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
      const nextPairs = normalizePairs(state.pairs);
      const nextPairsCsv = nextPairs.join(", ");
      if (state.pairs !== nextPairsCsv) {
        setState((prev) => ({ ...prev, pairs: nextPairsCsv }));
      }
      const nextSessions = normalizeNamedList(state.sessions, 40, SESSIONS);
      const nextSessionsCsv = nextSessions.join(", ");
      if (state.sessions !== nextSessionsCsv) {
        setState((prev) => ({ ...prev, sessions: nextSessionsCsv }));
      }
      const nextSetupTypes = normalizeNamedList(state.setupTypes, 80, SETUP_TYPES);
      const nextSetupTypesCsv = nextSetupTypes.join(", ");
      if (state.setupTypes !== nextSetupTypesCsv) {
        setState((prev) => ({ ...prev, setupTypes: nextSetupTypesCsv }));
      }
      const nextTradeTypes = normalizeTradeTypes(state.tradeTypes);
      const nextTradeTypesCsv = nextTradeTypes.join(", ");
      if (state.tradeTypes !== nextTradeTypesCsv) {
        setState((prev) => ({ ...prev, tradeTypes: nextTradeTypesCsv }));
      }
      const payload = {
        options: {
          pairs: nextPairs,
          sessions: nextSessions,
          setupTypes: nextSetupTypes,
          tradeTypes: nextTradeTypes,
          results: fromCsv(state.results),
          pocOutcomes: fromCsv(state.pocOutcomes),
          emotionTags: fromCsv(state.emotionTags),
        },
        riskControls: {
          requireRuleAlignment: state.requireRuleAlignment,
          maxTradesPerSession: Number(state.maxTradesPerSession) || 0,
          cooldownMinutesAfterLoss: Number(state.cooldownMinutesAfterLoss) || 0,
          stopForDayLossRR: Number(state.stopForDayLossRR) || 0,
          strictChecklistGate: state.strictChecklistGate,
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

  const copyText = async (value, successMessage) => {
    if (!value) {
      return;
    }
    try {
      await navigator.clipboard.writeText(value);
      setBridgeMessage(successMessage);
      setBridgeError("");
    } catch {
      setBridgeError("Clipboard copy failed. Please copy manually.");
    }
  };

  const handleGenerateBridgeKey = async () => {
    setBridgeBusy(true);
    setBridgeError("");
    setBridgeMessage("");
    setBridgeKey("");

    try {
      const response = await generateMt5BridgeKey(token, {
        label: bridgeLabel,
      });
      if (response?.user) {
        onUserUpdate(response.user);
      }
      setBridgeKey(response.apiKey || "");
      setBridgeMessage(
        response.apiKey
          ? "Bridge key generated. Save it in your MT5 bridge now."
          : "Bridge key rotation finished."
      );
    } catch (bridgeRequestError) {
      setBridgeError(bridgeRequestError.message || "Could not generate MT5 bridge key.");
    } finally {
      setBridgeBusy(false);
    }
  };

  const handleDisableBridge = async () => {
    const shouldDisable = window.confirm("Disable MT5 auto-journal sync and revoke its key?");
    if (!shouldDisable) {
      return;
    }
    setBridgeBusy(true);
    setBridgeError("");
    setBridgeMessage("");
    setBridgeKey("");

    try {
      const response = await disableMt5Bridge(token);
      if (response?.user) {
        onUserUpdate(response.user);
      }
      setBridgeMessage("MT5 bridge disabled.");
    } catch (bridgeDisableError) {
      setBridgeError(bridgeDisableError.message || "Could not disable MT5 bridge.");
    } finally {
      setBridgeBusy(false);
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
        <label className="flex items-center gap-2 text-sm text-textMain md:col-span-2">
          <input
            type="checkbox"
            checked={state.strictChecklistGate}
            onChange={(event) => onChange("strictChecklistGate", event.target.checked)}
          />
          Enforce checklist gate (Asia HL + POC + clean) before save
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

      <div className="mt-3 space-y-3 rounded-md border border-border bg-panelMuted p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-xs uppercase tracking-wide text-textMuted">MT5 Auto Journal Bridge</p>
            <p className="mt-1 text-sm text-textMuted">
              Auto-import trades, entry/exit screenshots, and strategy fields from your MT5 bridge script.
            </p>
          </div>
          <span className="chip">{mt5Integration.enabled ? "Enabled" : "Disabled"}</span>
        </div>

        <label>
          <span className="label">Bridge Label</span>
          <input
            className="input"
            value={bridgeLabel}
            onChange={(event) => setBridgeLabel(event.target.value)}
            placeholder="MT5 Desktop Bridge"
          />
        </label>

        <label>
          <span className="label">Bridge Endpoint</span>
          <div className="flex gap-2">
            <input className="input" value={bridgeEndpoint} readOnly />
            <button
              type="button"
              className="chip text-textMain transition hover:border-accent"
              onClick={() => copyText(bridgeEndpoint, "Bridge endpoint copied.")}
            >
              Copy
            </button>
          </div>
        </label>

        {bridgeKey ? (
          <label>
            <span className="label">Generated API Key (shown once)</span>
            <div className="flex gap-2">
              <input className="input" value={bridgeKey} readOnly />
              <button
                type="button"
                className="chip text-textMain transition hover:border-accent"
                onClick={() => copyText(bridgeKey, "Bridge API key copied.")}
              >
                Copy key
              </button>
            </div>
          </label>
        ) : null}

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            className="btn-primary"
            onClick={handleGenerateBridgeKey}
            disabled={bridgeBusy}
          >
            {bridgeBusy ? "Generating..." : mt5Integration.enabled ? "Rotate bridge key" : "Enable bridge"}
          </button>
          <button
            type="button"
            className="chip text-textMain transition hover:border-danger"
            onClick={handleDisableBridge}
            disabled={bridgeBusy || !mt5Integration.enabled}
          >
            Disable bridge
          </button>
        </div>

        <div className="text-xs text-textMuted">
          <p>Key hint: {mt5Integration.keyHint || "not generated"}</p>
          <p>Last used: {formatDateTime(mt5Integration.lastUsedAt) || "never"}</p>
          <p>Last event: {mt5Integration.lastEventType || "none"} {formatDateTime(mt5Integration.lastEventAt)}</p>
        </div>
      </div>

      {error ? <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{error}</p> : null}
      {bridgeMessage ? (
        <p className="mt-3 rounded-md border border-border bg-panelMuted p-2 text-sm text-textMain">{bridgeMessage}</p>
      ) : null}
      {bridgeError ? (
        <p className="mt-3 rounded-md border border-danger/40 bg-danger/10 p-2 text-sm text-danger">{bridgeError}</p>
      ) : null}

      <button type="button" className="btn-primary mt-3" onClick={handleSave} disabled={loading}>
        {loading ? "Saving..." : "Save settings"}
      </button>
    </section>
  );
};

export default SettingsPanel;
