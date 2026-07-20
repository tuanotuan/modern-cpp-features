import { afterEach, describe, expect, it } from "vitest";

import { monthlyBudgetUsdMicros, usageCostUsdMicros } from "./usage";

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
});
