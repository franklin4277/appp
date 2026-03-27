import assert from "node:assert/strict";
import test from "node:test";
import { summarizeWeeklyReview, weekRange } from "../src/services/review.js";

test("weekRange returns 7-day inclusive UTC window", () => {
  const { start, end } = weekRange(new Date("2026-03-27T12:00:00.000Z"));
  assert.equal(start.toISOString().slice(0, 10), "2026-03-21");
  assert.equal(end.toISOString().slice(0, 10), "2026-03-27");
});

test("summarizeWeeklyReview computes key metrics and action plan", () => {
  const trades = [
    {
      result: "Win",
      rrAchieved: 1.5,
      setupType: "Asia Break → Continuation",
      tags: { cleanSetup: true, asiaHighLowUsed: true, pocInteraction: true },
      notes: { emotionalState: "calm, focused" },
      ruleBreakReason: "",
    },
    {
      result: "Loss",
      rrAchieved: -1,
      setupType: "Asia Break → Reversal",
      tags: { cleanSetup: false, asiaHighLowUsed: true, pocInteraction: false },
      notes: { emotionalState: "rushed, fomo" },
      ruleBreakReason: "Forced trade",
    },
    {
      result: "Win",
      rrAchieved: 2.2,
      setupType: "Asia Break → Continuation",
      tags: { cleanSetup: true, asiaHighLowUsed: true, pocInteraction: true },
      notes: { emotionalState: "calm" },
      ruleBreakReason: "",
    },
  ];

  const summary = summarizeWeeklyReview(trades);
  assert.equal(summary.totalTrades, 3);
  assert.equal(summary.winRate, 66.7);
  assert.equal(summary.bestSetup.label, "Asia Break → Continuation");
  assert.equal(summary.biggestMistake.count >= 1, true);
  assert.equal(Array.isArray(summary.actionPlan), true);
  assert.equal(summary.actionPlan.length > 0, true);
});
