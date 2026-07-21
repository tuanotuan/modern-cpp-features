import { describe, expect, it } from "vitest";

import {
  mergeAiDailyBudgetSnapshot,
  type AiDailyBudgetSnapshot,
} from "./budget";

function snapshot(
  usageDate: string,
  actualUsdMicros: number,
  remainingPercent: number,
): AiDailyBudgetSnapshot {
  return {
    actualUsdMicros,
    billingUsdMicros: actualUsdMicros,
    billingSyncedAt: "2026-07-21T10:00:00.000Z",
    requestCount: 1,
    inputTokens: 100,
    outputTokens: 50,
    lastModel: "gpt-5.6-luna",
    limitUsdMicros: 166_666,
    remainingPercent,
    usageDate,
  };
}

describe("AI budget snapshots", () => {
  it("does not let a stale response increase today's remaining quota", () => {
    const current = {
      ...snapshot("2026-07-21", 120_000, 28),
      requestCount: 4,
    };
    const stale = {
      ...snapshot("2026-07-21", 110_000, 34),
      requestCount: 3,
    };

    expect(mergeAiDailyBudgetSnapshot(current, stale)).toMatchObject({
      actualUsdMicros: 120_000,
      requestCount: 4,
      remainingPercent: 28,
    });
  });

  it("allows the quota to reset on a new Vietnam day", () => {
    const current = snapshot("2026-07-21", 160_000, 4);
    const tomorrow = snapshot("2026-07-22", 0, 100);

    expect(mergeAiDailyBudgetSnapshot(current, tomorrow)).toBe(tomorrow);
  });
});
