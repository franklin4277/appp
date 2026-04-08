import { Panel } from "../components/Panel";
import { Send } from "lucide-react";
import { useState } from "react";

const messages = [
  {
    role: "assistant",
    content: "Hi! I've analyzed your recent trading data. Your breakout trades are performing well, but I noticed some revenge trading patterns. What would you like to focus on today?",
  },
  {
    role: "user",
    content: "I want to understand why my Asia session trades underperform compared to London.",
  },
  {
    role: "assistant",
    content: "Great question. Looking at your data, Asia session has lower volatility and you're using the same setups as London. The breakout strategy needs more momentum. Consider switching to range-bound strategies during Asia or sitting out entirely. Would you like specific setup recommendations?",
  },
];

export default function Coaching() {
  const [message, setMessage] = useState("");

  return (
    <div className="p-4 lg:p-6 max-w-[1600px] mx-auto space-y-4">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Coaching</h1>
        <p className="text-xs text-muted-foreground">AI-powered analysis and guidance</p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Keep / Stop / Test Cards */}
        <div className="lg:col-span-1 space-y-3">
          <Panel title="Keep Doing" className="p-4">
            <div className="space-y-3">
              <div className="pb-3 border-b border-border last:border-0 last:pb-0">
                <p className="text-sm text-foreground mb-1">London breakouts</p>
                <p className="text-xs text-muted-foreground">83% win rate, +15.2R</p>
              </div>
              <div className="pb-3 border-b border-border last:border-0 last:pb-0">
                <p className="text-sm text-foreground mb-1">Tight stop placement</p>
                <p className="text-xs text-muted-foreground">Avg risk: 0.95%</p>
              </div>
              <div className="pb-3 border-b border-border last:border-0 last:pb-0">
                <p className="text-sm text-foreground mb-1">Screenshot discipline</p>
                <p className="text-xs text-muted-foreground">89% coverage</p>
              </div>
            </div>
          </Panel>

          <Panel title="Stop Doing" className="p-4">
            <div className="space-y-3">
              <div className="pb-3 border-b border-border last:border-0 last:pb-0">
                <p className="text-sm text-foreground mb-1">Revenge trading</p>
                <p className="text-xs text-muted-foreground">-8.5R impact</p>
              </div>
              <div className="pb-3 border-b border-border last:border-0 last:pb-0">
                <p className="text-sm text-foreground mb-1">Trading in Asia</p>
                <p className="text-xs text-muted-foreground">Poor edge: 56% WR</p>
              </div>
              <div className="pb-3 border-b border-border last:border-0 last:pb-0">
                <p className="text-sm text-foreground mb-1">Overtrading</p>
                <p className="text-xs text-muted-foreground">&gt;5 trades/day</p>
              </div>
            </div>
          </Panel>

          <Panel title="Test Next" className="p-4">
            <div className="space-y-3">
              <div className="pb-3 border-b border-border last:border-0 last:pb-0">
                <p className="text-sm text-foreground mb-1">Scaling in winners</p>
                <p className="text-xs text-muted-foreground">After +1R move</p>
              </div>
              <div className="pb-3 border-b border-border last:border-0 last:pb-0">
                <p className="text-sm text-foreground mb-1">News filter</p>
                <p className="text-xs text-muted-foreground">Avoid high impact</p>
              </div>
              <div className="pb-3 border-b border-border last:border-0 last:pb-0">
                <p className="text-sm text-foreground mb-1">Session rotation</p>
                <p className="text-xs text-muted-foreground">London only</p>
              </div>
            </div>
          </Panel>
        </div>

        {/* AI Chat Panel */}
        <div className="lg:col-span-2">
          <Panel title="AI Assistant" className="flex flex-col h-[600px]">
            {/* Messages */}
            <div className="flex-1 overflow-y-auto space-y-4 mb-4">
              {messages.map((msg, idx) => (
                <div
                  key={idx}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[80%] rounded-lg px-4 py-2.5 ${
                      msg.role === "user"
                        ? "bg-primary text-white"
                        : "bg-muted text-foreground"
                    }`}
                  >
                    <p className="text-sm leading-relaxed">{msg.content}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Input */}
            <div className="flex gap-2 pt-4 border-t border-border">
              <input
                type="text"
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                placeholder="Ask about your trading performance..."
                className="flex-1 px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
              <button className="px-4 py-2 bg-primary hover:bg-primary-hover text-white rounded transition-colors">
                <Send className="w-4 h-4" />
              </button>
            </div>
          </Panel>
        </div>
      </div>
    </div>
  );
}
