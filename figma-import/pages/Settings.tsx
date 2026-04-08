import { Panel } from "../components/Panel";
import { Plus, X } from "lucide-react";
import { useState } from "react";

export default function Settings() {
  const [pairs, setPairs] = useState(["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD"]);
  const [setups, setSetups] = useState(["Breakout", "Rejection", "Trend", "Supply", "Demand"]);
  const [sessions, setSessions] = useState(["London", "New York", "Asia"]);

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-4">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Settings</h1>
        <p className="text-xs text-muted-foreground">Configure your workspace</p>
      </div>

      {/* Account Settings */}
      <Panel title="Account" className="p-6">
        <div className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Account Size</label>
              <input
                type="number"
                defaultValue={25000}
                className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Currency</label>
              <select className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary">
                <option>USD</option>
                <option>EUR</option>
                <option>GBP</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Max Daily Loss</label>
              <input
                type="number"
                defaultValue={500}
                className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Max Drawdown</label>
              <input
                type="number"
                defaultValue={2000}
                className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>
        </div>
      </Panel>

      {/* Trading Pairs */}
      <Panel title="Trading Pairs" className="p-6">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {pairs.map((pair, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded text-sm text-foreground"
              >
                <span>{pair}</span>
                <button
                  onClick={() => setPairs(pairs.filter((_, i) => i !== idx))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add new pair..."
              className="flex-1 px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded text-sm transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Panel>

      {/* Setups */}
      <Panel title="Setups" className="p-6">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {setups.map((setup, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded text-sm text-foreground"
              >
                <span>{setup}</span>
                <button
                  onClick={() => setSetups(setups.filter((_, i) => i !== idx))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add new setup..."
              className="flex-1 px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded text-sm transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Panel>

      {/* Sessions */}
      <Panel title="Sessions" className="p-6">
        <div className="space-y-4">
          <div className="flex flex-wrap gap-2">
            {sessions.map((session, idx) => (
              <div
                key={idx}
                className="flex items-center gap-2 px-3 py-1.5 bg-muted rounded text-sm text-foreground"
              >
                <span>{session}</span>
                <button
                  onClick={() => setSessions(sessions.filter((_, i) => i !== idx))}
                  className="text-muted-foreground hover:text-foreground"
                >
                  <X className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
          <div className="flex gap-2">
            <input
              type="text"
              placeholder="Add new session..."
              className="flex-1 px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
            />
            <button className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded text-sm transition-colors">
              <Plus className="w-4 h-4" />
            </button>
          </div>
        </div>
      </Panel>

      {/* Preferences */}
      <Panel title="Preferences" className="p-6">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Email Notifications</p>
              <p className="text-xs text-muted-foreground">Receive daily performance summaries</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Screenshot Reminders</p>
              <p className="text-xs text-muted-foreground">Prompt to upload charts when logging trades</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>

          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-foreground">Dark Mode</p>
              <p className="text-xs text-muted-foreground">Professional dark theme</p>
            </div>
            <label className="relative inline-flex items-center cursor-pointer">
              <input type="checkbox" className="sr-only peer" defaultChecked />
              <div className="w-11 h-6 bg-muted peer-focus:outline-none peer-focus:ring-2 peer-focus:ring-primary rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary"></div>
            </label>
          </div>
        </div>
      </Panel>

      {/* Save Button */}
      <div className="flex justify-end pt-4">
        <button className="px-6 py-2.5 bg-primary hover:bg-primary-hover text-white rounded text-sm font-medium transition-colors">
          Save Changes
        </button>
      </div>
    </div>
  );
}
