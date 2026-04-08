import { Panel } from "../components/Panel";
import { Plus, CheckCircle2, BookOpen } from "lucide-react";
import { useState } from "react";

const playbooks = [
  {
    id: 1,
    name: "London Breakout",
    description: "High momentum breakout during London open",
    confirmations: ["Price above key level", "Volume spike", "Trend alignment"],
    winRate: 83,
    totalR: 15.2,
  },
  {
    id: 2,
    name: "Supply Zone Rejection",
    description: "Price rejection at identified supply levels",
    confirmations: ["Clean supply zone", "Rejection candle", "Lower timeframe confirmation"],
    winRate: 72,
    totalR: 12.8,
  },
  {
    id: 3,
    name: "Trend Continuation",
    description: "Trading pullbacks in established trends",
    confirmations: ["Strong trend", "Pullback to support", "Momentum divergence"],
    winRate: 59,
    totalR: 6.2,
  },
];

export default function Playbooks() {
  const [showForm, setShowForm] = useState(false);

  return (
    <div className="p-4 lg:p-6 max-w-[1400px] mx-auto space-y-4">
      {/* Page Title */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-1">Playbooks</h1>
          <p className="text-xs text-muted-foreground">Your trading strategies</p>
        </div>
        <button 
          onClick={() => setShowForm(!showForm)}
          className="flex items-center gap-2 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded text-sm transition-colors"
        >
          <Plus className="w-4 h-4" />
          <span>New Playbook</span>
        </button>
      </div>

      {/* Quick Builder Form */}
      {showForm && (
        <Panel title="Create Playbook" className="p-6">
          <div className="space-y-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Strategy Name</label>
              <input
                type="text"
                placeholder="e.g., Morning Range Breakout"
                className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Description</label>
              <textarea
                rows={2}
                placeholder="Brief description of the setup..."
                className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Confirmations</label>
              <div className="space-y-2">
                <input
                  type="text"
                  placeholder="Confirmation 1"
                  className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="text"
                  placeholder="Confirmation 2"
                  className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
                <input
                  type="text"
                  placeholder="Confirmation 3"
                  className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
                />
              </div>
            </div>
            <div className="flex gap-3 pt-2">
              <button className="flex-1 px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded text-sm transition-colors">
                Create Playbook
              </button>
              <button 
                onClick={() => setShowForm(false)}
                className="px-6 py-2 bg-muted hover:bg-secondary text-foreground rounded text-sm transition-colors"
              >
                Cancel
              </button>
            </div>
          </div>
        </Panel>
      )}

      {/* Playbook Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {playbooks.map((playbook) => (
          <Panel key={playbook.id} className="p-5">
            <div className="space-y-4">
              <div>
                <h3 className="text-base font-semibold text-foreground mb-1">{playbook.name}</h3>
                <p className="text-xs text-muted-foreground">{playbook.description}</p>
              </div>

              <div className="space-y-2">
                <p className="text-xs text-muted-foreground font-medium">Confirmations:</p>
                {playbook.confirmations.map((confirmation, idx) => (
                  <div key={idx} className="flex items-start gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-profit mt-0.5 flex-shrink-0" />
                    <span className="text-xs text-foreground">{confirmation}</span>
                  </div>
                ))}
              </div>

              <div className="pt-3 border-t border-border flex items-center justify-between">
                <div>
                  <p className="text-xs text-muted-foreground">Win Rate</p>
                  <p className="text-sm font-semibold text-foreground">{playbook.winRate}%</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Total R</p>
                  <p className="text-sm font-semibold text-profit">+{playbook.totalR}R</p>
                </div>
              </div>

              <button className="w-full px-4 py-2 bg-muted hover:bg-secondary text-foreground rounded text-sm transition-colors">
                View Details
              </button>
            </div>
          </Panel>
        ))}
      </div>

      {/* Empty State for New Users */}
      {playbooks.length === 0 && !showForm && (
        <Panel className="p-12 text-center">
          <div className="max-w-sm mx-auto space-y-4">
            <div className="w-12 h-12 bg-muted rounded-full flex items-center justify-center mx-auto">
              <BookOpen className="w-6 h-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-base font-semibold text-foreground mb-1">No playbooks yet</h3>
              <p className="text-sm text-muted-foreground">
                Create your first strategy playbook to document your edge
              </p>
            </div>
            <button 
              onClick={() => setShowForm(true)}
              className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded text-sm transition-colors"
            >
              Create First Playbook
            </button>
          </div>
        </Panel>
      )}
    </div>
  );
}