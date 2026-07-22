import { describe, expect, it } from "vitest";

import {
  aiDailyBudgetSnapshotFromUsageRead,
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

  it("does not accept a late snapshot from an older Vietnam day", () => {
    const today = snapshot("2026-07-22", 40_000, 76);
    const yesterday = snapshot("2026-07-21", 160_000, 4);

    expect(mergeAiDailyBudgetSnapshot(today, yesterday)).toBe(today);
  });

  it("returns unavailable instead of fabricating 100% after a read error", () => {
    expect(
      aiDailyBudgetSnapshotFromUsageRead({
        row: null,
        readError: { code: "PGRST204" },
        usageDate: "2026-07-22",
      }),
    ).toBeNull();
  });

  it("returns 100% only for a confirmed successful empty daily read", () => {
    expect(
      aiDailyBudgetSnapshotFromUsageRead({
        row: null,
        usageDate: "2026-07-22",
      }),
    ).toMatchObject({
      actualUsdMicros: 0,
      remainingPercent: 100,
      usageDate: "2026-07-22",
    });
  });

  it("keeps the database usage floor when provider billing lags", () => {
    expect(
      aiDailyBudgetSnapshotFromUsageRead({
        row: {
          actual_usd_micros: 90_000,
          provider_usd_micros: 80_000,
          provider_actual_baseline_usd_micros: 90_000,
          usage_floor_usd_micros: 115_000,
          provider_synced_at: "2026-07-22T10:00:00.000Z",
          request_count: 4,
        },
        usageDate: "2026-07-22",
      }),
    ).toMatchObject({
      actualUsdMicros: 115_000,
      requestCount: 4,
      remainingPercent: 31,
    });
  });
});
