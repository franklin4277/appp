import { Panel } from "../components/Panel";
import { AlertTriangle, TrendingUp } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const progressData = [
  { date: "Week 1", equity: 25000 },
  { date: "Week 2", equity: 25800 },
  { date: "Week 3", equity: 26200 },
  { date: "Week 4", equity: 27100 },
  { date: "Week 5", equity: 27800 },
  { date: "Week 6", equity: 28500 },
];

export default function RiskCenter() {
  const accountSize = 25000;
  const currentEquity = 28500;
  const dailyLossLimit = 500;
  const weeklyLossLimit = 1250;
  const maxDrawdown = 2000;
  const profitTarget = 30000;

  const dailyLossUsed = 125;
  const weeklyLossUsed = 450;
  const currentDrawdown = 0;

  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Risk Center</h1>
        <p className="text-xs text-muted-foreground">Control room for discipline</p>
      </div>

      {/* Account Overview */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Panel className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Account Size</p>
            <p className="text-2xl font-semibold text-foreground">${accountSize.toLocaleString()}</p>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Current Equity</p>
            <p className="text-2xl font-semibold text-profit">${currentEquity.toLocaleString()}</p>
            <p className="text-xs text-profit flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +{((currentEquity / accountSize - 1) * 100).toFixed(1)}%
            </p>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Profit Target</p>
            <p className="text-2xl font-semibold text-foreground">${profitTarget.toLocaleString()}</p>
            <p className="text-xs text-muted-foreground">
              ${(profitTarget - currentEquity).toLocaleString()} to go
            </p>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Max Drawdown</p>
            <p className="text-2xl font-semibold text-foreground">${maxDrawdown.toLocaleString()}</p>
            <p className="text-xs text-profit">Safe zone</p>
          </div>
        </Panel>
      </div>

      {/* Risk Limits */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Panel title="Daily Loss Limit" className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Limit</span>
              <span className="text-sm font-medium text-foreground">${dailyLossLimit}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Used</span>
              <span className="text-sm font-medium text-profit">${dailyLossUsed}</span>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Remaining</span>
                <span className="text-xs text-muted-foreground">
                  {((dailyLossLimit - dailyLossUsed) / dailyLossLimit * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-profit transition-all"
                  style={{ width: `${((dailyLossLimit - dailyLossUsed) / dailyLossLimit * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Weekly Loss Limit" className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Limit</span>
              <span className="text-sm font-medium text-foreground">${weeklyLossLimit}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Used</span>
              <span className="text-sm font-medium text-profit">${weeklyLossUsed}</span>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Remaining</span>
                <span className="text-xs text-muted-foreground">
                  {((weeklyLossLimit - weeklyLossUsed) / weeklyLossLimit * 100).toFixed(0)}%
                </span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div
                  className="h-full bg-profit transition-all"
                  style={{ width: `${((weeklyLossLimit - weeklyLossUsed) / weeklyLossLimit * 100)}%` }}
                />
              </div>
            </div>
          </div>
        </Panel>

        <Panel title="Current Drawdown" className="p-4">
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Max Allowed</span>
              <span className="text-sm font-medium text-foreground">${maxDrawdown}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Current</span>
              <span className="text-sm font-medium text-profit">${currentDrawdown}</span>
            </div>
            <div>
              <div className="flex items-center justify-between mb-2">
                <span className="text-xs text-muted-foreground">Safety Buffer</span>
                <span className="text-xs text-muted-foreground">100%</span>
              </div>
              <div className="h-2 bg-muted rounded-full overflow-hidden">
                <div className="h-full bg-profit transition-all" style={{ width: "100%" }} />
              </div>
            </div>
          </div>
        </Panel>
      </div>

      {/* Funded Account Rules */}
      <Panel title="Funded Account Rules" className="p-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="flex items-start gap-3">
            <div className="w-5 h-5 bg-profit/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
              <div className="w-2 h-2 bg-profit rounded-full" />
            </div>
            <div>
              <p className="text-sm text-foreground mb-1">Max Daily Loss: $500</p>
              <p className="text-xs text-muted-foreground">Currently safe with ${dailyLossLimit - dailyLossUsed} buffer</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-5 h-5 bg-profit/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
              <div className="w-2 h-2 bg-profit rounded-full" />
            </div>
            <div>
              <p className="text-sm text-foreground mb-1">Max Total Drawdown: $2,000</p>
              <p className="text-xs text-muted-foreground">Well above water with no drawdown</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-5 h-5 bg-profit/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
              <div className="w-2 h-2 bg-profit rounded-full" />
            </div>
            <div>
              <p className="text-sm text-foreground mb-1">Profit Target: $5,000</p>
              <p className="text-xs text-muted-foreground">70% complete - ${profitTarget - currentEquity} remaining</p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <div className="w-5 h-5 bg-profit/10 rounded flex items-center justify-center flex-shrink-0 mt-0.5">
              <div className="w-2 h-2 bg-profit rounded-full" />
            </div>
            <div>
              <p className="text-sm text-foreground mb-1">Min Trading Days: 5</p>
              <p className="text-xs text-muted-foreground">18 days traded this evaluation</p>
            </div>
          </div>
        </div>
      </Panel>

      {/* Progress Chart */}
      <Panel title="Equity Progress" className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={progressData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#33363f" />
            <XAxis dataKey="date" stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <YAxis stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#2a2d36",
                border: "1px solid #33363f",
                borderRadius: "6px",
                color: "#e4e6eb",
              }}
            />
            <Line type="monotone" dataKey="equity" stroke="#10b981" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      {/* Risk Alerts */}
      <Panel title="Risk Alerts" className="p-4">
        <div className="space-y-3">
          <div className="flex items-start gap-3 p-3 bg-profit/5 border border-profit/20 rounded">
            <AlertTriangle className="w-4 h-4 text-profit flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-sm text-foreground">All risk parameters within safe limits</p>
              <p className="text-xs text-muted-foreground mt-1">Continue trading with discipline</p>
            </div>
          </div>
        </div>
      </Panel>
    </div>
  );
}