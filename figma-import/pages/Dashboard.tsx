import { Panel } from "../components/Panel";
import { TrendingUp, TrendingDown } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";

const equityData = [
  { date: "Jan 1", value: 25000 },
  { date: "Jan 8", value: 25800 },
  { date: "Jan 15", value: 25500 },
  { date: "Jan 22", value: 26200 },
  { date: "Jan 29", value: 27100 },
  { date: "Feb 5", value: 26900 },
  { date: "Feb 12", value: 27800 },
  { date: "Feb 19", value: 28500 },
];

const recentTrades = [
  { id: 1, pair: "EUR/USD", type: "Buy", entry: 1.0925, exit: 1.0965, r: "+2.5R", pnl: "+$625", setup: "Breakout" },
  { id: 2, pair: "GBP/USD", type: "Sell", entry: 1.2650, exit: 1.2630, r: "+1.8R", pnl: "+$450", setup: "Rejection" },
  { id: 3, pair: "USD/JPY", type: "Buy", entry: 148.20, exit: 147.90, r: "-1.0R", pnl: "-$250", setup: "Trend" },
  { id: 4, pair: "AUD/USD", type: "Sell", entry: 0.6580, exit: 0.6540, r: "+3.2R", pnl: "+$800", setup: "Supply" },
];

export default function Dashboard() {
  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Dashboard</h1>
        <p className="text-xs text-muted-foreground">Command center</p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <Panel className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Total Trades</p>
            <p className="text-2xl font-semibold text-foreground">127</p>
            <p className="text-xs text-profit flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +12 this week
            </p>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Win Rate</p>
            <p className="text-2xl font-semibold text-foreground">68.5%</p>
            <p className="text-xs text-profit flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              +2.1% vs last month
            </p>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Net R</p>
            <p className="text-2xl font-semibold text-profit">+42.7R</p>
            <p className="text-xs text-muted-foreground">14 winners</p>
          </div>
        </Panel>

        <Panel className="p-4">
          <div className="space-y-1">
            <p className="text-xs text-muted-foreground">Expectancy</p>
            <p className="text-2xl font-semibold text-foreground">1.82R</p>
            <p className="text-xs text-profit flex items-center gap-1">
              <TrendingUp className="w-3 h-3" />
              Above target
            </p>
          </div>
        </Panel>
      </div>

      {/* Equity Chart */}
      <Panel title="Equity Curve" className="h-[400px]">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={equityData}>
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
            <Line type="monotone" dataKey="value" stroke="#3b82f6" strokeWidth={2} dot={false} />
          </LineChart>
        </ResponsiveContainer>
      </Panel>

      {/* Summary Cards Row */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-3">
        <Panel title="Top Setup" className="p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Breakout</span>
              <span className="text-sm font-medium text-profit">+15.2R</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">12 trades</span>
              <span className="text-xs text-muted-foreground">83% win rate</span>
            </div>
          </div>
        </Panel>

        <Panel title="Top Session" className="p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">London Open</span>
              <span className="text-sm font-medium text-profit">+22.8R</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">28 trades</span>
              <span className="text-xs text-muted-foreground">71% win rate</span>
            </div>
          </div>
        </Panel>

        <Panel title="Biggest Leak" className="p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-sm text-foreground">Revenge trading</span>
              <span className="text-sm font-medium text-loss">-8.5R</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">5 trades</span>
              <span className="text-xs text-muted-foreground">20% win rate</span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Recent Trades Table */}
      <Panel title="Recent Trades">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Pair</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Type</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Entry</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Exit</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">R</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">P&L</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Setup</th>
              </tr>
            </thead>
            <tbody>
              {recentTrades.map((trade) => (
                <tr key={trade.id} className="border-b border-border last:border-0">
                  <td className="text-sm text-foreground py-3 px-3">{trade.pair}</td>
                  <td className="text-sm text-foreground py-3 px-3">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs ${
                        trade.type === "Buy" ? "bg-profit/10 text-profit" : "bg-loss/10 text-loss"
                      }`}
                    >
                      {trade.type}
                    </span>
                  </td>
                  <td className="text-sm text-muted-foreground py-3 px-3">{trade.entry}</td>
                  <td className="text-sm text-muted-foreground py-3 px-3">{trade.exit}</td>
                  <td className={`text-sm font-medium py-3 px-3 ${trade.r.startsWith('+') ? 'text-profit' : 'text-loss'}`}>
                    {trade.r}
                  </td>
                  <td className={`text-sm font-medium py-3 px-3 ${trade.pnl.startsWith('+') ? 'text-profit' : 'text-loss'}`}>
                    {trade.pnl}
                  </td>
                  <td className="text-sm text-muted-foreground py-3 px-3">{trade.setup}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}