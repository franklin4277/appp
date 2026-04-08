import { Panel } from "../components/Panel";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, LineChart, Line } from "recharts";

const setupData = [
  { name: "Breakout", r: 15.2, trades: 12, winRate: 83 },
  { name: "Supply", r: 12.8, trades: 18, winRate: 72 },
  { name: "Rejection", r: 8.5, trades: 15, winRate: 67 },
  { name: "Trend", r: 6.2, trades: 22, winRate: 59 },
  { name: "Demand", r: -2.3, trades: 8, winRate: 38 },
];

const sessionData = [
  { name: "London", r: 22.8, trades: 28, winRate: 71 },
  { name: "New York", r: 18.5, trades: 35, winRate: 69 },
  { name: "Asia", r: 1.4, trades: 18, winRate: 56 },
  { name: "Pre-market", r: 0, trades: 12, winRate: 50 },
];

const drawdownData = [
  { date: "Week 1", value: 0 },
  { date: "Week 2", value: -2.5 },
  { date: "Week 3", value: -1.8 },
  { date: "Week 4", value: -4.2 },
  { date: "Week 5", value: -2.1 },
  { date: "Week 6", value: 0 },
];

export default function Analytics() {
  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Analytics</h1>
        <p className="text-xs text-muted-foreground">Performance breakdown</p>
      </div>

      {/* Setup Performance */}
      <Panel title="Setup Performance" className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={setupData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#33363f" />
            <XAxis dataKey="name" stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <YAxis stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#2a2d36",
                border: "1px solid #33363f",
                borderRadius: "6px",
                color: "#e4e6eb",
              }}
            />
            <Bar dataKey="r" fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* Setup Details Table */}
      <Panel title="Setup Breakdown">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Setup</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Total R</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Trades</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Win Rate</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Avg R</th>
              </tr>
            </thead>
            <tbody>
              {setupData.map((setup) => (
                <tr key={setup.name} className="border-b border-border last:border-0">
                  <td className="text-sm text-foreground py-3 px-3">{setup.name}</td>
                  <td className={`text-sm font-medium py-3 px-3 ${setup.r >= 0 ? 'text-profit' : 'text-loss'}`}>
                    {setup.r >= 0 ? '+' : ''}{setup.r}R
                  </td>
                  <td className="text-sm text-muted-foreground py-3 px-3">{setup.trades}</td>
                  <td className="text-sm text-muted-foreground py-3 px-3">{setup.winRate}%</td>
                  <td className="text-sm text-muted-foreground py-3 px-3">
                    {(setup.r / setup.trades).toFixed(2)}R
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Session Performance */}
      <Panel title="Session Performance" className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={sessionData}>
            <CartesianGrid strokeDasharray="3 3" stroke="#33363f" />
            <XAxis dataKey="name" stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <YAxis stroke="#9ca3af" tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <Tooltip
              contentStyle={{
                backgroundColor: "#2a2d36",
                border: "1px solid #33363f",
                borderRadius: "6px",
                color: "#e4e6eb",
              }}
            />
            <Bar dataKey="r" fill="#10b981" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </Panel>

      {/* Drawdown Chart */}
      <Panel title="Drawdown Analysis" className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={drawdownData}>
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
            <Line type="monotone" dataKey="value" stroke="#ef4444" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      {/* Performance Metrics */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Panel className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Avg Win</p>
            <p className="text-xl font-semibold text-profit">+2.8R</p>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Avg Loss</p>
            <p className="text-xl font-semibold text-loss">-0.9R</p>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Win/Loss Ratio</p>
            <p className="text-xl font-semibold text-foreground">3.1</p>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Profit Factor</p>
            <p className="text-xl font-semibold text-foreground">2.4</p>
          </div>
        </Panel>
      </div>
    </div>
  );
}