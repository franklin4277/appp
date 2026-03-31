import { memo, useMemo, useState } from "react";
import {
  DEFAULT_RETENTION_PREFERENCES,
  readRetentionPreferences,
  writeRetentionPreferences,
} from "../utils/retention";

const WEEK_DAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

const ToggleField = ({ label, checked, onChange, hint }) => (
  <label className="rounded-xl border border-border bg-panelMuted p-3 text-sm">
    <div className="flex items-center justify-between gap-2">
      <span className="text-textMain">{label}</span>
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
    </div>
    {hint ? <p className="mt-1 text-xs text-textMuted">{hint}</p> : null}
  </label>
);

const RetentionPanel = ({ onPreferencesSaved }) => {
  const [state, setState] = useState(() => readRetentionPreferences());
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState("");

  const notificationSupported = typeof window !== "undefined" && "Notification" in window;

  const permissionLabel = useMemo(() => {
    if (!notificationSupported) {
      return "Not supported in this browser";
    }
    return Notification.permission;
  }, [notificationSupported]);

  const handleSave = () => {
    const next = writeRetentionPreferences(state);
    setState(next);
    setSaved(true);
    setMessage("Retention reminders saved.");
    if (typeof onPreferencesSaved === "function") {
      onPreferencesSaved(next);
    }
  };

  const requestNotifications = async () => {
    if (!notificationSupported) {
      setMessage("Notifications are not supported in this browser.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission === "granted") {
      const next = {
        ...state,
        desktopNotificationsEnabled: true,
      };
      setState(next);
      writeRetentionPreferences(next);
      setMessage("Desktop notifications enabled.");
      if (typeof onPreferencesSaved === "function") {
        onPreferencesSaved(next);
      }
      return;
    }
    setMessage("Notification permission was not granted.");
  };

  return (
    <section className="panel animate-riseIn">
      <div className="section-title">
        <h2>Retention System</h2>
        <p>Daily consistency</p>
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <ToggleField
          label="Daily trading reminder"
          checked={state.dailyReminderEnabled}
          onChange={(value) => {
            setSaved(false);
            setState((prev) => ({ ...prev, dailyReminderEnabled: value }));
          }}
          hint="Keeps journaling consistent after sessions."
        />
        <label className="rounded-xl border border-border bg-panelMuted p-3 text-sm">
          <span className="label">Daily reminder time</span>
          <input
            className="input"
            type="time"
            value={state.dailyReminderTime || DEFAULT_RETENTION_PREFERENCES.dailyReminderTime}
            onChange={(event) => {
              setSaved(false);
              setState((prev) => ({ ...prev, dailyReminderTime: event.target.value }));
            }}
          />
        </label>

        <ToggleField
          label="Weekly performance report"
          checked={state.weeklyReportEnabled}
          onChange={(value) => {
            setSaved(false);
            setState((prev) => ({ ...prev, weeklyReportEnabled: value }));
          }}
          hint="Generates review nudges weekly."
        />
        <label className="rounded-xl border border-border bg-panelMuted p-3 text-sm">
          <span className="label">Weekly report schedule</span>
          <div className="grid grid-cols-2 gap-2">
            <select
              className="input"
              value={state.weeklyReportDay || DEFAULT_RETENTION_PREFERENCES.weeklyReportDay}
              onChange={(event) => {
                setSaved(false);
                setState((prev) => ({ ...prev, weeklyReportDay: event.target.value }));
              }}
            >
              {WEEK_DAYS.map((day) => (
                <option key={day} value={day}>
                  {day}
                </option>
              ))}
            </select>
            <input
              className="input"
              type="time"
              value={state.weeklyReportTime || DEFAULT_RETENTION_PREFERENCES.weeklyReportTime}
              onChange={(event) => {
                setSaved(false);
                setState((prev) => ({ ...prev, weeklyReportTime: event.target.value }));
              }}
            />
          </div>
        </label>

        <ToggleField
          label="Insight notifications"
          checked={state.insightAlertsEnabled}
          onChange={(value) => {
            setSaved(false);
            setState((prev) => ({ ...prev, insightAlertsEnabled: value }));
          }}
          hint="Warns on overtrading and behavior drift."
        />
        <ToggleField
          label="Desktop notifications"
          checked={state.desktopNotificationsEnabled}
          onChange={(value) => {
            setSaved(false);
            setState((prev) => ({ ...prev, desktopNotificationsEnabled: value }));
          }}
          hint={`Permission: ${permissionLabel}`}
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button type="button" className="btn-primary" onClick={handleSave}>
          Save retention settings
        </button>
        <button type="button" className="chip text-textMain transition hover:border-accent" onClick={requestNotifications}>
          Enable browser notifications
        </button>
        {saved ? <span className="chip">Saved</span> : null}
      </div>

      {message ? (
        <p className="mt-3 rounded-xl border border-border bg-panelMuted p-2 text-xs text-textMuted">{message}</p>
      ) : null}
    </section>
  );
};

export default memo(RetentionPanel);

