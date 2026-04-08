import { Panel } from "../components/Panel";
import { Upload, X, Image as ImageIcon } from "lucide-react";
import { useState } from "react";

const pairs = ["EUR/USD", "GBP/USD", "USD/JPY", "AUD/USD", "USD/CAD", "NZD/USD"];
const setups = ["Breakout", "Rejection", "Trend", "Supply", "Demand", "Range"];
const sessions = ["London", "New York", "Asia", "Pre-market"];

export default function AddTrade() {
  const [tradeType, setTradeType] = useState<"buy" | "sell">("buy");
  const [beforeScreenshot, setBeforeScreenshot] = useState<string | null>(null);
  const [afterScreenshot, setAfterScreenshot] = useState<string | null>(null);

  const handleFileUpload = (
    e: React.ChangeEvent<HTMLInputElement>,
    type: "before" | "after"
  ) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        if (type === "before") {
          setBeforeScreenshot(reader.result as string);
        } else {
          setAfterScreenshot(reader.result as string);
        }
      };
      reader.readAsDataURL(file);
    }
  };

  const removeScreenshot = (type: "before" | "after") => {
    if (type === "before") {
      setBeforeScreenshot(null);
    } else {
      setAfterScreenshot(null);
    }
  };

  return (
    <div className="p-4 lg:p-6 max-w-4xl mx-auto space-y-4">
      {/* Page Title */}
      <div className="mb-6">
        <h1 className="text-2xl font-semibold text-foreground mb-1">Add Trade</h1>
        <p className="text-xs text-muted-foreground">Log a new position</p>
      </div>

      <Panel className="p-6">
        <div className="space-y-6">
          {/* Buy/Sell Toggle */}
          <div>
            <label className="block text-xs text-muted-foreground mb-2">Direction</label>
            <div className="inline-flex rounded-md bg-muted p-1">
              <button
                onClick={() => setTradeType("buy")}
                className={`px-6 py-1.5 text-sm rounded transition-colors ${
                  tradeType === "buy"
                    ? "bg-profit text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Buy
              </button>
              <button
                onClick={() => setTradeType("sell")}
                className={`px-6 py-1.5 text-sm rounded transition-colors ${
                  tradeType === "sell"
                    ? "bg-loss text-white"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Sell
              </button>
            </div>
          </div>

          {/* Pair Selection */}
          <div>
            <label className="block text-xs text-muted-foreground mb-2">Pair</label>
            <div className="flex flex-wrap gap-2">
              {pairs.map((pair) => (
                <button
                  key={pair}
                  className="px-3 py-1.5 bg-muted text-sm text-foreground rounded hover:bg-primary hover:text-white transition-colors"
                >
                  {pair}
                </button>
              ))}
            </div>
          </div>

          {/* Price Fields */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Entry Price</label>
              <input
                type="number"
                step="0.00001"
                placeholder="1.0925"
                className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Stop Loss</label>
              <input
                type="number"
                step="0.00001"
                placeholder="1.0900"
                className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Take Profit</label>
              <input
                type="number"
                step="0.00001"
                placeholder="1.0975"
                className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Risk % and Size */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Risk %</label>
              <input
                type="number"
                step="0.1"
                placeholder="1.0"
                className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground mb-2">Position Size</label>
              <input
                type="number"
                placeholder="0.50"
                className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary"
              />
            </div>
          </div>

          {/* Session Selection */}
          <div>
            <label className="block text-xs text-muted-foreground mb-2">Session</label>
            <div className="flex flex-wrap gap-2">
              {sessions.map((session) => (
                <button
                  key={session}
                  className="px-3 py-1.5 bg-muted text-sm text-foreground rounded hover:bg-primary hover:text-white transition-colors"
                >
                  {session}
                </button>
              ))}
            </div>
          </div>

          {/* Setup Selection */}
          <div>
            <label className="block text-xs text-muted-foreground mb-2">Setup</label>
            <div className="flex flex-wrap gap-2">
              {setups.map((setup) => (
                <button
                  key={setup}
                  className="px-3 py-1.5 bg-muted text-sm text-foreground rounded hover:bg-primary hover:text-white transition-colors"
                >
                  {setup}
                </button>
              ))}
            </div>
          </div>

          {/* Notes */}
          <div>
            <label className="block text-xs text-muted-foreground mb-2">Notes</label>
            <textarea
              rows={3}
              placeholder="Trade rationale, market conditions, emotional state..."
              className="w-full px-3 py-2 bg-input-background border border-input rounded text-sm text-foreground focus:outline-none focus:ring-1 focus:ring-primary resize-none"
            />
          </div>

          {/* Screenshot Uploads - Before and After */}
          <div className="space-y-4">
            <label className="block text-xs text-muted-foreground">Chart Screenshots</label>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Before Screenshot */}
              <div>
                <div className="text-xs font-medium text-foreground mb-2">Before Trade</div>
                {beforeScreenshot ? (
                  <div className="relative group">
                    <img
                      src={beforeScreenshot}
                      alt="Before"
                      className="w-full h-48 object-cover rounded-lg border border-input"
                    />
                    <button
                      onClick={() => removeScreenshot("before")}
                      className="absolute top-2 right-2 p-1.5 bg-background/90 hover:bg-loss border border-input rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4 text-foreground" />
                    </button>
                    <div className="absolute bottom-2 left-2 right-2 bg-background/90 backdrop-blur-sm border border-input rounded px-2 py-1 text-xs text-muted-foreground">
                      Pre-entry chart analysis
                    </div>
                  </div>
                ) : (
                  <label className="block border-2 border-dashed border-input rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer bg-input-background/30">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, "before")}
                      className="hidden"
                    />
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Upload before screenshot</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 10MB</p>
                  </label>
                )}
              </div>

              {/* After Screenshot */}
              <div>
                <div className="text-xs font-medium text-foreground mb-2">After Trade</div>
                {afterScreenshot ? (
                  <div className="relative group">
                    <img
                      src={afterScreenshot}
                      alt="After"
                      className="w-full h-48 object-cover rounded-lg border border-input"
                    />
                    <button
                      onClick={() => removeScreenshot("after")}
                      className="absolute top-2 right-2 p-1.5 bg-background/90 hover:bg-loss border border-input rounded-lg opacity-0 group-hover:opacity-100 transition-opacity"
                    >
                      <X className="w-4 h-4 text-foreground" />
                    </button>
                    <div className="absolute bottom-2 left-2 right-2 bg-background/90 backdrop-blur-sm border border-input rounded px-2 py-1 text-xs text-muted-foreground">
                      Post-exit outcome
                    </div>
                  </div>
                ) : (
                  <label className="block border-2 border-dashed border-input rounded-lg p-6 text-center hover:border-primary/50 transition-colors cursor-pointer bg-input-background/30">
                    <input
                      type="file"
                      accept="image/*"
                      onChange={(e) => handleFileUpload(e, "after")}
                      className="hidden"
                    />
                    <ImageIcon className="w-8 h-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">Upload after screenshot</p>
                    <p className="text-xs text-muted-foreground mt-1">PNG, JPG up to 10MB</p>
                  </label>
                )}
              </div>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-3 pt-4">
            <button className="flex-1 px-4 py-2.5 bg-primary hover:bg-primary-hover text-white rounded text-sm font-medium transition-colors">
              Log Trade
            </button>
            <button className="px-6 py-2.5 bg-muted hover:bg-secondary text-foreground rounded text-sm font-medium transition-colors">
              Cancel
            </button>
          </div>
        </div>
      </Panel>
    </div>
  );
}