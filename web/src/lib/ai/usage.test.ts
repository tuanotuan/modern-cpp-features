import { afterEach, describe, expect, it } from "vitest";

import {
  dailyBudgetRemainingPercent,
  dailyBudgetUsdMicros,
  monthlyBudgetUsdMicros,
  usageCostUsdMicros,
  reconciledUsageUsdMicros,
  vietnamUsageDate,
} from "./usage";

describe("OpenAI usage accounting", () => {
  const originalBudget = process.env.OPENAI_MONTHLY_BUDGET_USD;

  afterEach(() => {
    if (originalBudget === undefined) {
      delete process.env.OPENAI_MONTHLY_BUDGET_USD;
    } else {
      process.env.OPENAI_MONTHLY_BUDGET_USD = originalBudget;
    }
  });

  it("prices Luna uncached, cached, cache-write and output tokens", () => {
    expect(
      usageCostUsdMicros("gpt-5.6-luna", {
        inputTokens: 4_000,
        cachedInputTokens: 1_000,
        cacheWriteTokens: 500,
        outputTokens: 800,
      }),
    ).toBe(8_025);
  });

  it("prices Terra usage", () => {
    expect(
      usageCostUsdMicros("gpt-5.6-terra", {
        inputTokens: 4_000,
        cachedInputTokens: 0,
        cacheWriteTokens: 0,
        outputTokens: 800,
      }),
    ).toBe(22_000);
  });

  it("defaults to a five-dollar monthly application budget", () => {
    delete process.env.OPENAI_MONTHLY_BUDGET_USD;
    expect(monthlyBudgetUsdMicros()).toBe(5_000_000);
  });

  it("splits the monthly budget evenly across 30 Vietnam days", () => {
    delete process.env.OPENAI_MONTHLY_BUDGET_USD;
    expect(dailyBudgetUsdMicros()).toBe(166_666);
    expect(dailyBudgetRemainingPercent(0)).toBe(100);
    expect(dailyBudgetRemainingPercent(83_333)).toBe(50);
    expect(dailyBudgetRemainingPercent(111_000)).toBe(33.4);
    expect(dailyBudgetRemainingPercent(200_000)).toBe(0);
  });

  it("keys usage by the calendar day in Vietnam", () => {
    expect(vietnamUsageDate(new Date("2026-07-20T16:59:59.000Z"))).toBe("2026-07-20");
    expect(vietnamUsageDate(new Date("2026-07-20T17:00:00.000Z"))).toBe("2026-07-21");
  });

  it("adds realtime usage after the latest provider billing baseline", () => {
    expect(
      reconciledUsageUsdMicros({
        realtimeUsdMicros: 110_065,
        providerUsdMicros: 110_065,
        realtimeBaselineUsdMicros: 104_682,
        providerSynced: true,
      }),
    ).toBe(115_448);
  });

  it("uses realtime directly before provider billing has synced", () => {
    expect(
      reconciledUsageUsdMicros({
        realtimeUsdMicros: 12_345,
        providerUsdMicros: 0,
        realtimeBaselineUsdMicros: 0,
        providerSynced: false,
      }),
    ).toBe(12_345);
  });

  it("never decreases usage when provider billing is behind realtime", () => {
    expect(
      reconciledUsageUsdMicros({
        realtimeUsdMicros: 115_000,
        providerUsdMicros: 110_065,
        realtimeBaselineUsdMicros: 110_065,
        usageFloorUsdMicros: 115_448,
        providerSynced: true,
      }),
    ).toBe(115_448);
  });

  it("still advances above the floor when a new request costs more", () => {
    expect(
      reconciledUsageUsdMicros({
        realtimeUsdMicros: 120_000,
        providerUsdMicros: 110_065,
        realtimeBaselineUsdMicros: 110_065,
        usageFloorUsdMicros: 115_448,
        providerSynced: true,
      }),
    ).toBe(120_000);
  });
});
