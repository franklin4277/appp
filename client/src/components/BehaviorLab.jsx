import { useEffect, useMemo, useState } from "react";

const WINDOWS = [10, 20, 30, 50];
const OUTCOME_FILTERS = ["All", "Acceptance", "Rejection"];
const METRICS = ["winRate", "averageRR", "cleanRate", "ruleRate"];

const metricMeta = {
  winRate: {
    label: "Win Rate",
    suffix: "%",
    precision: 0,
  },
  averageRR: {
    label: "Avg RR",
    suffix: " RR",
    precision: 2,
  },
  cleanRate: {
    label: "Clean Setup %",
    suffix: "%",
    precision: 0,
  },
  ruleRate: {
    label: "Rule Alignment %",
    suffix: "%",
    precision: 0,
  },
};

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const toTimestamp = (trade) => {
  const dateValue = trade.tradeDate || trade.createdAt || "";
  const timestamp = new Date(dateValue).getTime();
  return Number.isFinite(timestamp) ? timestamp : 0;
};

const normalizeEmotionTags = (text = "") =>
  String(text)
    .split(/[,\|/;]+/)
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

const isRuleAligned = (trade) => Boolean(trade.tags?.asiaHighLowUsed && trade.tags?.pocInteraction);

const formatMetricValue = (metric, value) => {
  const meta = metricMeta[metric];
  const rounded = Math.round(value * 10 ** meta.precision) / 10 ** meta.precision;
  return `${rounded}${meta.suffix}`;
};

const formatSigned = (value, precision = 1) => {
  const rounded = Math.round(value * 10 ** precision) / 10 ** precision;
  if (rounded > 0) {
    return `+${rounded}`;
  }
  return String(rounded);
};

const deltaClass = (delta) => {
  if (delta > 0) {
    return "text-textMain";
  }
  if (delta < 0) {
    return "text-danger";
  }
  return "text-textMuted";
};

const summarize = (trades) => {
  const total = trades.length;
  if (!total) {
    return {
      total: 0,
      winRate: 0,
      averageRR: 0,
      cleanRate: 0,
      ruleRate: 0,
    };
  }

  const wins = trades.filter((trade) => trade.result === "Win").length;
  const cleanTrades = trades.filter((trade) => trade.tags?.cleanSetup).length;
  const alignedTrades = trades.filter((trade) => isRuleAligned(trade)).length;
  const totalRR = trades.reduce((sum, trade) => sum + toNumber(trade.rrAchieved), 0);

  return {
    total,
    winRate: Math.round((wins / total) * 100),
    averageRR: Math.round((totalRR / total) * 100) / 100,
    cleanRate: Math.round((cleanTrades / total) * 100),
    ruleRate: Math.round((alignedTrades / total) * 100),
  };
};

const valueByMetric = (trade, metric) => {
  if (metric === "winRate") {
    return trade.result === "Win" ? 100 : 0;
  }
  if (metric === "averageRR") {
    return toNumber(trade.rrAchieved);
  }
  if (metric === "cleanRate") {
    return trade.tags?.cleanSetup ? 100 : 0;
  }
  if (metric === "ruleRate") {
    return isRuleAligned(trade) ? 100 : 0;
  }
  return 0;
};

const isPositiveShift = (metric, delta) => {
  if (metric === "averageRR") {
    return delta > 0.12;
  }
  return delta > 3;
};

const byAbsoluteDelta = (a, b) => Math.abs(b.delta) - Math.abs(a.delta);

const summarizeByField = (trades, field) => {
  const buckets = new Map();
  trades.forEach((trade) => {
    const key = String(trade[field] || "Unknown");
    const items = buckets.get(key) || [];
    items.push(trade);
    buckets.set(key, items);
  });

  return [...buckets.entries()].map(([key, items]) => ({
    key,
    ...summarize(items),
  }));
};

const tipLabelByTone = {
  positive: "Keep",
  caution: "Fix",
  neutral: "Focus",
};

const BehaviorLab = ({ trades = [] }) => {
  const [windowSize, setWindowSize] = useState(20);
  const [selectedMetric, setSelectedMetric] = useState("winRate");
  const [selectedOutcome, setSelectedOutcome] = useState("All");
  const [selectedEmotion, setSelectedEmotion] = useState("");
  const [activeTipId, setActiveTipId] = useState("");

  const sortedTrades = useMemo(
    () => [...trades].sort((a, b) => toTimestamp(b) - toTimestamp(a)),
    [trades]
  );

  const scopedTrades = useMemo(() => {
    if (selectedOutcome === "All") {
      return sortedTrades;
    }
    return sortedTrades.filter(
      (trade) => (trade.tags?.pocOutcome || "").toLowerCase() === selectedOutcome.toLowerCase()
    );
  }, [selectedOutcome, sortedTrades]);

  const recentTrades = scopedTrades.slice(0, windowSize);
  const previousTrades = scopedTrades.slice(windowSize, windowSize * 2);
  const recentSummary = summarize(recentTrades);
  const previousSummary = summarize(previousTrades);

  const deltas = {
    winRate: recentSummary.winRate - previousSummary.winRate,
    averageRR: Math.round((recentSummary.averageRR - previousSummary.averageRR) * 100) / 100,
    cleanRate: recentSummary.cleanRate - previousSummary.cleanRate,
    ruleRate: recentSummary.ruleRate - previousSummary.ruleRate,
  };

  const metricShifts = METRICS.map((metric) => ({
    metric,
    delta: deltas[metric],
  }));

  const strongestShift = [...metricShifts].sort(byAbsoluteDelta)[0] || null;
  const positiveCount = metricShifts.filter((item) => isPositiveShift(item.metric, item.delta)).length;

  const coachHeadline = useMemo(() => {
    if (!recentSummary.total) {
      return "No recent trades in this lens yet.";
    }
    if (recentSummary.total < 6) {
      return "Early read: keep logging a few more trades.";
    }
    if (positiveCount >= 3) {
      return "Momentum improving. Your recent execution is stronger.";
    }
    if (positiveCount === 2) {
      return "Performance is stable with room to tighten consistency.";
    }
    return "Behavior drift detected. Slow down and protect the edge.";
  }, [positiveCount, recentSummary.total]);

  const coachDetail = useMemo(() => {
    if (!strongestShift) {
      return "Track emotional state and setup discipline to unlock coaching insights.";
    }
    const meta = metricMeta[strongestShift.metric];
    const precision = meta.precision || 0;
    return `${meta.label} shifted ${formatSigned(strongestShift.delta, precision)}${meta.suffix} versus the previous ${windowSize} trades.`;
  }, [strongestShift, windowSize]);

  const emotionPatterns = useMemo(() => {
    const map = new Map();

    recentTrades.forEach((trade) => {
      const emotions = normalizeEmotionTags(trade.notes?.emotionalState || "");
      emotions.forEach((emotion) => {
        const current = map.get(emotion) || {
          total: 0,
          wins: 0,
          totalRR: 0,
          cleanTrades: 0,
        };
        current.total += 1;
        current.totalRR += toNumber(trade.rrAchieved);
        if (trade.result === "Win") {
          current.wins += 1;
        }
        if (trade.tags?.cleanSetup) {
          current.cleanTrades += 1;
        }
        map.set(emotion, current);
      });
    });

    return [...map.entries()]
      .map(([emotion, stat]) => ({
        emotion,
        total: stat.total,
        winRate: Math.round((stat.wins / stat.total) * 100),
        avgRR: Math.round((stat.totalRR / stat.total) * 100) / 100,
        cleanRate: Math.round((stat.cleanTrades / stat.total) * 100),
      }))
      .filter((item) => item.total >= 2)
      .sort((a, b) => b.avgRR - a.avgRR)
      .slice(0, 6);
  }, [recentTrades]);

  const tips = useMemo(() => {
    if (!recentSummary.total) {
      return [
        {
          id: "start-logging",
          tone: "neutral",
          title: "Start with at least 6 logged trades",
          action: "Add more completed trades so tip quality improves.",
          reason: "The coaching engine needs a minimum sample to detect behavior patterns.",
        },
      ];
    }

    const next = [];

    if (recentSummary.ruleRate < 70) {
      next.push({
        id: "rule-alignment",
        tone: "caution",
        title: "Rule alignment is below target",
        action: "Only take trades where Asia High/Low and POC interaction are both true.",
        reason: `Current rule alignment is ${recentSummary.ruleRate}%. Aim for at least 75%.`,
      });
    }

    if (recentSummary.cleanRate < 60) {
      next.push({
        id: "clean-filter",
        tone: "caution",
        title: "Quality filter is too loose",
        action: "Skip non-clean entries and prioritize A+ setup confirmations.",
        reason: `Only ${recentSummary.cleanRate}% of recent trades were marked clean.`,
      });
    }

    if (recentSummary.averageRR < 0.4) {
      next.push({
        id: "rr-protection",
        tone: "caution",
        title: "RR is under pressure",
        action: "Tighten stop placement and avoid entries that force weak RR.",
        reason: `Average RR is ${recentSummary.averageRR}. Target a positive buffer above 0.5.`,
      });
    }

    if (deltas.winRate <= -6 || deltas.averageRR <= -0.2) {
      next.push({
        id: "slow-down",
        tone: "caution",
        title: "Recent performance cooled off",
        action: "Reduce size for the next 3 trades and execute only textbook setups.",
        reason: `Win rate delta ${formatSigned(deltas.winRate)}% and RR delta ${formatSigned(deltas.averageRR, 2)} RR.`,
      });
    }

    if (positiveCount >= 3) {
      next.push({
        id: "momentum",
        tone: "positive",
        title: "Strong momentum detected",
        action: "Keep the same decision checklist and avoid changing the process mid-run.",
        reason: `${positiveCount} of 4 core metrics are improving versus the previous window.`,
      });
    }

    if (deltas.averageRR >= 0.2) {
      next.push({
        id: "rr-improving",
        tone: "positive",
        title: "Execution quality is improving",
        action: "Document the exact confirmation pattern used before entry.",
        reason: `Average RR improved by ${formatSigned(deltas.averageRR, 2)} RR.`,
      });
    }

    const bestEmotion = emotionPatterns[0];
    const worstEmotion = [...emotionPatterns].sort((a, b) => a.avgRR - b.avgRR)[0];

    if (bestEmotion && bestEmotion.avgRR >= recentSummary.averageRR + 0.15) {
      next.push({
        id: `emotion-keep-${bestEmotion.emotion}`,
        tone: "positive",
        title: `Best emotional state: ${bestEmotion.emotion}`,
        action: `Recreate the pre-trade routine linked to "${bestEmotion.emotion}" before entries.`,
        reason: `${bestEmotion.total} trades at ${bestEmotion.winRate}% win and RR ${bestEmotion.avgRR}.`,
      });
    }

    if (worstEmotion && worstEmotion.avgRR <= recentSummary.averageRR - 0.15) {
      next.push({
        id: `emotion-fix-${worstEmotion.emotion}`,
        tone: "caution",
        title: `Risk state: ${worstEmotion.emotion}`,
        action: `If you feel "${worstEmotion.emotion}", pause and wait for the next clean setup.`,
        reason: `This pattern trails your current average by ${formatSigned(
          worstEmotion.avgRR - recentSummary.averageRR,
          2
        )} RR.`,
      });
    }

    const sessionSummary = summarizeByField(recentTrades, "session")
      .filter((item) => item.total >= 2)
      .sort((a, b) => b.averageRR - a.averageRR);

    if (sessionSummary.length >= 2) {
      const bestSession = sessionSummary[0];
      const weakestSession = sessionSummary[sessionSummary.length - 1];
      const rrGap = bestSession.averageRR - weakestSession.averageRR;
      if (rrGap >= 0.25) {
        next.push({
          id: "session-focus",
          tone: "neutral",
          title: `Lean into ${bestSession.key} session quality`,
          action: `Trade ${bestSession.key} setups with priority and tighten filters in ${weakestSession.key}.`,
          reason: `${bestSession.key} outperforms ${weakestSession.key} by ${Math.round(rrGap * 100) / 100} RR.`,
        });
      }
    }

    const setupSummary = summarizeByField(recentTrades, "setupType")
      .filter((item) => item.total >= 2)
      .sort((a, b) => b.winRate - a.winRate);

    if (setupSummary.length) {
      const leader = setupSummary[0];
      if (leader.winRate >= 65) {
        next.push({
          id: "setup-leader",
          tone: "positive",
          title: `${leader.key} is your strongest setup`,
          action: "Prioritize this setup when market context matches your rule set.",
          reason: `${leader.total} trades with ${leader.winRate}% win rate in the selected lens.`,
        });
      }
    }

    if (!next.length) {
      next.push({
        id: "steady",
        tone: "neutral",
        title: "Performance is balanced",
        action: "Keep journaling with strict tags to unlock sharper behavior tips.",
        reason: "No major drift or standout edge detected in the current window.",
      });
    }

    return next.slice(0, 6);
  }, [
    deltas.averageRR,
    deltas.winRate,
    emotionPatterns,
    positiveCount,
    recentSummary.averageRR,
    recentSummary.cleanRate,
    recentSummary.ruleRate,
    recentSummary.total,
    recentTrades,
  ]);

  const sparkValues = useMemo(() => {
    const recent = [...scopedTrades.slice(0, Math.min(scopedTrades.length, 40))].reverse();
    return recent.map((trade) => valueByMetric(trade, selectedMetric));
  }, [scopedTrades, selectedMetric]);

  const sparkPath = useMemo(() => {
    if (!sparkValues.length) {
      return "";
    }
    const width = 320;
    const height = 90;
    const padding = 10;
    const min = Math.min(...sparkValues);
    const max = Math.max(...sparkValues);
    const spread = max - min || 1;

    return sparkValues
      .map((value, index) => {
        const x =
          padding + (index / Math.max(sparkValues.length - 1, 1)) * (width - padding * 2);
        const y = height - padding - ((value - min) / spread) * (height - padding * 2);
        return `${x},${y}`;
      })
      .join(" ");
  }, [sparkValues]);

  useEffect(() => {
    if (!emotionPatterns.length) {
      setSelectedEmotion("");
      return;
    }

    if (!selectedEmotion || !emotionPatterns.some((item) => item.emotion === selectedEmotion)) {
      setSelectedEmotion(emotionPatterns[0].emotion);
    }
  }, [emotionPatterns, selectedEmotion]);

  useEffect(() => {
    if (!tips.length) {
      setActiveTipId("");
      return;
    }

    if (!activeTipId || !tips.some((tip) => tip.id === activeTipId)) {
      setActiveTipId(tips[0].id);
    }
  }, [activeTipId, tips]);

  const selectedEmotionStats = useMemo(() => {
    if (!selectedEmotion) {
      return null;
    }

    const scopedEmotionTrades = recentTrades.filter((trade) =>
      normalizeEmotionTags(trade.notes?.emotionalState).includes(selectedEmotion)
    );

    if (!scopedEmotionTrades.length) {
      return null;
    }

    const emotionSummary = summarize(scopedEmotionTrades);
    return {
      summary: emotionSummary,
      winDelta: emotionSummary.winRate - recentSummary.winRate,
      rrDelta: Math.round((emotionSummary.averageRR - recentSummary.averageRR) * 100) / 100,
    };
  }, [recentSummary.averageRR, recentSummary.winRate, recentTrades, selectedEmotion]);

  const setupMomentum = useMemo(() => {
    const setups = new Set(
      [...recentTrades, ...previousTrades].map((trade) => trade.setupType || "Unlabeled setup")
    );

    const shifts = [...setups]
      .filter(Boolean)
      .map((setup) => {
        const recent = summarize(recentTrades.filter((trade) => trade.setupType === setup));
        const previous = summarize(previousTrades.filter((trade) => trade.setupType === setup));
        return {
          setup,
          trades: recent.total,
          winDelta: recent.winRate - previous.winRate,
          rrDelta: Math.round((recent.averageRR - previous.averageRR) * 100) / 100,
        };
      })
      .filter((item) => item.trades >= 2)
      .sort((a, b) => b.winDelta - a.winDelta);

    if (!shifts.length) {
      return {
        best: null,
        watch: null,
      };
    }

    return {
      best: shifts[0],
      watch: [...shifts].reverse()[0],
    };
  }, [previousTrades, recentTrades]);

  const activeTip = tips.find((tip) => tip.id === activeTipId) || null;

  return (
    <section className="panel animate-riseIn">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold">Behavior Lab</h3>
        <div className="flex flex-wrap gap-2 text-xs">
          {WINDOWS.map((value) => (
            <button
              key={value}
              type="button"
              className={`chip ${windowSize === value ? "border-accent text-textMain" : ""}`}
              onClick={() => setWindowSize(value)}
            >
              Last {value}
            </button>
          ))}
        </div>
      </div>

      <div className="mb-3 rounded-md border border-border bg-panelMuted p-3">
        <p className="text-xs uppercase tracking-wide text-textMuted">Behavior Coach</p>
        <p className="mt-1 text-sm font-medium">{coachHeadline}</p>
        <p className="mt-1 text-xs text-textMuted">{coachDetail}</p>
      </div>

      <div className="mb-3 rounded-md border border-border bg-panelMuted p-3">
        <div className="mb-2 flex items-center justify-between">
          <p className="text-xs uppercase tracking-wide text-textMuted">Smart Tips</p>
          <span className="chip">{tips.length} live</span>
        </div>
        <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
          {tips.map((tip) => (
            <button
              key={tip.id}
              type="button"
              className={`rounded-md border px-3 py-2 text-left transition ${
                activeTipId === tip.id
                  ? "border-accent bg-panel text-textMain"
                  : "border-border bg-panelMuted text-textMuted hover:border-accent"
              }`}
              onClick={() => setActiveTipId(tip.id)}
            >
              <span className="block text-[11px] uppercase tracking-wide text-textMuted">
                {tipLabelByTone[tip.tone] || "Focus"}
              </span>
              <span className="mt-0.5 block text-sm">{tip.title}</span>
            </button>
          ))}
        </div>
        {activeTip ? (
          <div className="mt-2 rounded-md border border-border bg-panel px-3 py-2">
            <p className="text-sm font-medium">{activeTip.action}</p>
            <p className="mt-1 text-xs text-textMuted">{activeTip.reason}</p>
          </div>
        ) : null}
      </div>

      <div className="mb-3 flex flex-wrap gap-2 text-xs">
        {OUTCOME_FILTERS.map((outcome) => (
          <button
            key={outcome}
            type="button"
            className={`chip ${selectedOutcome === outcome ? "border-accent text-textMain" : ""}`}
            onClick={() => setSelectedOutcome(outcome)}
          >
            {outcome}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-2 gap-2 text-xs sm:grid-cols-4">
        {METRICS.map((metric) => (
          <button
            key={metric}
            type="button"
            className={`rounded-md border px-2 py-1 text-left transition ${
              selectedMetric === metric
                ? "border-accent bg-panelMuted text-textMain"
                : "border-border bg-panel text-textMuted hover:border-accent"
            }`}
            onClick={() => setSelectedMetric(metric)}
          >
            {metricMeta[metric].label}
          </button>
        ))}
      </div>

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        {METRICS.map((metric) => (
          <article key={metric} className="rounded-md border border-border bg-panelMuted px-3 py-2">
            <p className="text-xs text-textMuted">{metricMeta[metric].label}</p>
            <div className="mt-1 flex items-center justify-between">
              <p className="text-base font-semibold">
                {formatMetricValue(metric, recentSummary[metric])}
              </p>
              <p className={`text-xs ${deltaClass(deltas[metric])}`}>
                {formatSigned(deltas[metric], metricMeta[metric].precision)}
                {metricMeta[metric].suffix}
              </p>
            </div>
          </article>
        ))}
      </div>

      {sparkValues.length ? (
        <div className="mb-3 rounded-md border border-border bg-panelMuted p-2">
          <p className="mb-1 text-xs text-textMuted">
            Trend line - {metricMeta[selectedMetric].label}
          </p>
          <svg className="h-24 w-full" viewBox="0 0 320 90" preserveAspectRatio="none">
            <polyline fill="none" stroke="#7391be" strokeWidth="2.5" points={sparkPath} />
          </svg>
        </div>
      ) : null}

      <div className="mb-3 grid grid-cols-1 gap-2 sm:grid-cols-2">
        <div className="rounded-md border border-border bg-panelMuted px-3 py-2 text-sm">
          <p className="text-xs uppercase tracking-wide text-textMuted">Setup Momentum</p>
          {setupMomentum.best ? (
            <p className="mt-1">
              <span className="text-textMain">{setupMomentum.best.setup}</span>{" "}
              <span className="text-textMuted">
                ({formatSigned(setupMomentum.best.winDelta)}% win,{" "}
                {formatSigned(setupMomentum.best.rrDelta, 2)} RR)
              </span>
            </p>
          ) : (
            <p className="mt-1 text-textMuted">Need more setup history.</p>
          )}
        </div>
        <div className="rounded-md border border-border bg-panelMuted px-3 py-2 text-sm">
          <p className="text-xs uppercase tracking-wide text-textMuted">Watch List</p>
          {setupMomentum.watch ? (
            <p className="mt-1">
              <span className="text-textMain">{setupMomentum.watch.setup}</span>{" "}
              <span className="text-textMuted">
                ({formatSigned(setupMomentum.watch.winDelta)}% win,{" "}
                {formatSigned(setupMomentum.watch.rrDelta, 2)} RR)
              </span>
            </p>
          ) : (
            <p className="mt-1 text-textMuted">Need more setup history.</p>
          )}
        </div>
      </div>

      <div>
        <p className="mb-2 text-xs uppercase tracking-wide text-textMuted">
          Behavior patterns in last {windowSize} trades
        </p>
        {emotionPatterns.length ? (
          <div className="space-y-2">
            {emotionPatterns.map((pattern) => (
              <button
                key={pattern.emotion}
                type="button"
                className={`w-full rounded-md border px-3 py-2 text-left text-sm transition ${
                  selectedEmotion === pattern.emotion
                    ? "border-accent bg-panel text-textMain"
                    : "border-border bg-panelMuted text-textMuted hover:border-accent"
                }`}
                onClick={() => setSelectedEmotion(pattern.emotion)}
              >
                <span className="block">{pattern.emotion}</span>
                <span className="text-xs">
                  {pattern.total} trades | {pattern.winRate}% win | RR {pattern.avgRR} |{" "}
                  {pattern.cleanRate}% clean
                </span>
              </button>
            ))}
          </div>
        ) : (
          <p className="text-sm text-textMuted">
            Add emotional notes in trades to unlock behavior pattern insights.
          </p>
        )}
      </div>

      {selectedEmotionStats ? (
        <div className="mt-3 rounded-md border border-border bg-panelMuted px-3 py-2 text-sm">
          <p className="text-xs uppercase tracking-wide text-textMuted">Selected Pattern Impact</p>
          <p className="mt-1">
            <span className="text-textMain capitalize">{selectedEmotion}</span>{" "}
            <span className="text-textMuted">
              ({selectedEmotionStats.summary.total} trades) is
              {selectedEmotionStats.winDelta >= 0 ? " outperforming " : " underperforming "}
              your current lens by {formatSigned(selectedEmotionStats.winDelta)}% win and{" "}
              {formatSigned(selectedEmotionStats.rrDelta, 2)} RR.
            </span>
          </p>
        </div>
      ) : null}
    </section>
  );
};

export default BehaviorLab;
