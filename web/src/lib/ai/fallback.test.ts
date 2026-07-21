import { afterEach, describe, expect, it, vi } from "vitest";

import {
  AiDailyBudgetExceededError,
  AiMonthlyBudgetExceededError,
} from "./budget";
import {
  AllAiQuotasExceededError,
  GeminiFallbackProviderError,
  runGeminiBudgetFallback,
} from "./fallback";

const usage = {
  inputTokens: 10,
  outputTokens: 5,
  thoughtTokens: 2,
  totalTokens: 17,
};

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("runGeminiBudgetFallback", () => {
  it("runs Gemini after the app daily budget is exhausted", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const operation = vi.fn().mockResolvedValue({
      data: { answer: "ok" },
      model: "gemini-test",
      usage,
    });

    await expect(
      runGeminiBudgetFallback(
        new AiDailyBudgetExceededError(),
        null,
        operation,
      ),
    ).resolves.toMatchObject({ model: "gemini-test" });
    expect(operation).toHaveBeenCalledOnce();
  });

  it("does not fallback for arbitrary OpenAI/provider errors", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    const original = new Error("provider failed");
    const operation = vi.fn();

    await expect(
      runGeminiBudgetFallback(original, null, operation),
    ).rejects.toBe(original);
    expect(operation).not.toHaveBeenCalled();
  });

  it("respects the fallback kill switch", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");
    vi.stubEnv("GEMINI_FALLBACK_ENABLED", "false");
    const original = new AiMonthlyBudgetExceededError();

    await expect(
      runGeminiBudgetFallback(original, null, vi.fn()),
    ).rejects.toBe(original);
  });

  it("reports when both OpenAI budget and Gemini quota are exhausted", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");

    await expect(
      runGeminiBudgetFallback(
        new AiDailyBudgetExceededError(),
        null,
        async () => {
          throw Object.assign(new Error("rate limited"), { status: 429 });
        },
      ),
    ).rejects.toBeInstanceOf(AllAiQuotasExceededError);
  });

  it("identifies non-quota Gemini failures separately", async () => {
    vi.stubEnv("GEMINI_API_KEY", "test-key");

    await expect(
      runGeminiBudgetFallback(
        new AiDailyBudgetExceededError(),
        null,
        async () => {
          throw new Error("bad response");
        },
      ),
    ).rejects.toBeInstanceOf(GeminiFallbackProviderError);
  });
});
