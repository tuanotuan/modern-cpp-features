import { describe, expect, it } from "vitest";

import type { AiDailyBudgetSnapshot } from "./budget";
import {
  aiDailyBudgetStorageKey,
  parseCurrentAiDailyBudgetSnapshot,
} from "./budget-cache";

const snapshot = {
  actualUsdMicros: 115_000,
  billingUsdMicros: 100_000,
  billingSyncedAt: "2026-07-22T10:00:00.000Z",
  requestCount: 4,
  inputTokens: 1_000,
  outputTokens: 500,
  lastModel: "gpt-5.6-luna",
  limitUsdMicros: 166_666,
  remainingPercent: 31,
  usageDate: "2026-07-22",
} satisfies AiDailyBudgetSnapshot;

describe("AI daily budget browser cache", () => {
  it("restores a valid snapshot only during the same Vietnam day", () => {
    const raw = JSON.stringify(snapshot);

    expect(
      parseCurrentAiDailyBudgetSnapshot(
        raw,
        new Date("2026-07-22T16:59:59.000Z"),
      ),
    ).toEqual(snapshot);
    expect(
      parseCurrentAiDailyBudgetSnapshot(
        raw,
        new Date("2026-07-22T17:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("rejects malformed or impossible cached values", () => {
    expect(parseCurrentAiDailyBudgetSnapshot("not-json")).toBeNull();
    expect(
      parseCurrentAiDailyBudgetSnapshot(
        JSON.stringify({ ...snapshot, remainingPercent: 101 }),
        new Date("2026-07-22T10:00:00.000Z"),
      ),
    ).toBeNull();
  });

  it("isolates cached usage by account", () => {
    expect(aiDailyBudgetStorageKey("user-a")).not.toBe(
      aiDailyBudgetStorageKey("user-b"),
    );
  });
});
