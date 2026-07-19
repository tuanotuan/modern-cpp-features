import { describe, expect, it } from "vitest";

import {
  isProviderRateLimitError,
  nextQuestionIds,
  retryProviderRateLimit,
} from "./drafts";

describe("question draft IDs", () => {
  it("continues a lesson's numeric sequence without collisions", () => {
    expect(
      nextQuestionIds(
        "cpp11-auto",
        ["cpp11-auto-001", "cpp11-auto-003", "cpp11-nullptr-004"],
        2,
      ),
    ).toEqual(["cpp11-auto-004", "cpp11-auto-005"]);
  });

  it("waits for the provider window and retries a 429", async () => {
    const delays: number[] = [];
    let attempts = 0;
    const result = await retryProviderRateLimit(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error("Please retry in 0.01s."), {
            statusCode: 429,
          });
        }
        return "ok";
      },
      { sleep: async (delay) => void delays.push(delay) },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
    expect(delays).toEqual([1010]);
  });

  it("does not retry non-rate-limit provider errors", async () => {
    let attempts = 0;
    await expect(
      retryProviderRateLimit(async () => {
        attempts += 1;
        throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
      }),
    ).rejects.toThrow("Unauthorized");
    expect(attempts).toBe(1);
  });

  it("recognizes provider rate-limit errors for deferred generation", () => {
    expect(isProviderRateLimitError({ statusCode: 429 })).toBe(true);
    expect(isProviderRateLimitError({ status: 429 })).toBe(true);
    expect(isProviderRateLimitError({ statusCode: 500 })).toBe(false);
  });
});
