import { Panel } from "../components/Panel";
import { Calendar } from "lucide-react";

const weeklyData = [
  { week: "Week 1", trades: 12, r: "+8.5R", winRate: "75%" },
  { week: "Week 2", trades: 15, r: "+12.2R", winRate: "80%" },
  { week: "Week 3", trades: 18, r: "-2.1R", winRate: "56%" },
  { week: "Week 4", trades: 14, r: "+15.8R", winRate: "86%" },
];

const pastTrades = [
  { id: 1, date: "Apr 5", pair: "EUR/USD", type: "Buy", r: "+2.5R", pnl: "+$625", setup: "Breakout", screenshot: true },
  { id: 2, date: "Apr 4", pair: "GBP/USD", type: "Sell", r: "+1.8R", pnl: "+$450", setup: "Rejection", screenshot: true },
  { id: 3, date: "Apr 3", pair: "USD/JPY", type: "Buy", r: "-1.0R", pnl: "-$250", setup: "Trend", screenshot: false },
  { id: 4, date: "Apr 2", pair: "AUD/USD", type: "Sell", r: "+3.2R", pnl: "+$800", setup: "Supply", screenshot: true },
  { id: 5, date: "Apr 1", pair: "EUR/GBP", type: "Buy", r: "+1.5R", pnl: "+$375", setup: "Demand", screenshot: true },
];

export default function Review() {
  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4">
      {/* Page Title */}
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold text-foreground mb-1">Review</h1>
          <p className="text-xs text-muted-foreground">Performance analysis</p>
        </div>
        <button className="flex items-center gap-2 px-4 py-2 bg-muted hover:bg-secondary text-foreground rounded text-sm transition-colors">
          <Calendar className="w-4 h-4" />
          <span>Last 30 Days</span>
        </button>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
        <Panel title="Best Setup" className="p-4">
          <div className="space-y-2">
            <p className="text-lg font-semibold text-foreground">Breakout</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">12 trades</span>
              <span className="text-sm font-medium text-profit">+15.2R</span>
            </div>
          </div>
        </Panel>

        <Panel title="Worst Habit" className="p-4">
          <div className="space-y-2">
            <p className="text-lg font-semibold text-foreground">Overtrading</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">8 trades</span>
              <span className="text-sm font-medium text-loss">-5.2R</span>
            </div>
          </div>
        </Panel>

        <Panel title="Screenshot Coverage" className="p-4">
          <div className="space-y-2">
            <p className="text-lg font-semibold text-foreground">89%</p>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">113 / 127 trades</span>
            </div>
          </div>
        </Panel>

        <Panel title="Trade Breakdown" className="p-4">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Winners</span>
              <span className="text-sm text-profit">87</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">Losers</span>
              <span className="text-sm text-loss">40</span>
            </div>
          </div>
        </Panel>
      </div>

      {/* Weekly Performance */}
      <Panel title="Weekly Performance">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Period</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Trades</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Net R</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Win Rate</th>
              </tr>
            </thead>
            <tbody>
              {weeklyData.map((week) => (
                <tr key={week.week} className="border-b border-border last:border-0">
                  <td className="text-sm text-foreground py-3 px-3">{week.week}</td>
                  <td className="text-sm text-muted-foreground py-3 px-3">{week.trades}</td>
                  <td className={`text-sm font-medium py-3 px-3 ${week.r.startsWith('+') ? 'text-profit' : 'text-loss'}`}>
                    {week.r}
                  </td>
                  <td className="text-sm text-muted-foreground py-3 px-3">{week.winRate}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      {/* Key Insights */}
      <Panel title="Key Insights" className="p-4">
        <div className="space-y-3">
          <div className="flex items-start gap-3">
            <div className="w-1 h-1 bg-profit rounded-full mt-2" />
            <div>
              <p className="text-sm text-foreground">Your London session breakout trades are performing exceptionally well</p>
              <p className="text-xs text-muted-foreground mt-1">Consider increasing position size within risk limits</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-1 h-1 bg-loss rounded-full mt-2" />
            <div>
              <p className="text-sm text-foreground">Revenge trading after losses is impacting consistency</p>
              <p className="text-xs text-muted-foreground mt-1">Take a 15-minute break after any losing trade</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <div className="w-1 h-1 bg-primary rounded-full mt-2" />
            <div>
              <p className="text-sm text-foreground">Screenshot coverage improved by 12% this month</p>
              <p className="text-xs text-muted-foreground mt-1">Great progress on documentation discipline</p>
            </div>
          </div>
        </div>
      </Panel>

      {/* Past Trades */}
      <Panel title="Past Trades">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border">
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Date</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Pair</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Type</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">R</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">P&L</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Setup</th>
                <th className="text-left text-xs text-muted-foreground font-medium py-2 px-3">Screenshot</th>
              </tr>
            </thead>
            <tbody>
              {pastTrades.map((trade) => (
                <tr key={trade.id} className="border-b border-border last:border-0">
                  <td className="text-sm text-muted-foreground py-3 px-3">{trade.date}</td>
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
                  <td className={`text-sm font-medium py-3 px-3 ${trade.r.startsWith('+') ? 'text-profit' : 'text-loss'}`}>
                    {trade.r}
                  </td>
                  <td className={`text-sm font-medium py-3 px-3 ${trade.pnl.startsWith('+') ? 'text-profit' : 'text-loss'}`}>
                    {trade.pnl}
                  </td>
                  <td className="text-sm text-muted-foreground py-3 px-3">{trade.setup}</td>
                  <td className="text-sm text-muted-foreground py-3 px-3">
                    {trade.screenshot ? (
                      <span className="text-profit">✓</span>
                    ) : (
                      <span className="text-muted-foreground">-</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>
    </div>
  );
}
