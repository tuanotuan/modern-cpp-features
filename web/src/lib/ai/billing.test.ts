import { afterEach, describe, expect, it, vi } from "vitest";

import { loadOpenAiBillingCosts } from "./billing";

describe("OpenAI Billing reconciliation", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("reads official project costs for the Vietnam day and month", async () => {
    const urls: URL[] = [];
    vi.stubGlobal(
      "fetch",
      vi.fn(async (input: URL | RequestInfo) => {
        const url = new URL(String(input));
        urls.push(url);
        const startTime = Number(url.searchParams.get("start_time"));
        const isDaily = startTime > Date.parse("2026-07-01T00:00:00+07:00") / 1000;
        return new Response(
          JSON.stringify({
            data: [
              {
                results: [
                  {
                    amount: {
                      value: isDaily ? 0.012345 : 0.123456,
                      currency: "usd",
                    },
                  },
                ],
              },
            ],
            has_more: false,
            next_page: null,
          }),
          { status: 200 },
        );
      }),
    );

    const costs = await loadOpenAiBillingCosts(
      "admin-test-key",
      "proj_test_billing",
      new Date("2026-07-20T10:00:00.000Z"),
    );

    expect(costs.dailyUsdMicros).toBe(12_345);
    expect(costs.monthlyUsdMicros).toBe(123_456);
    expect(urls).toHaveLength(2);
    expect(urls.every((url) => url.searchParams.get("project_ids") === "proj_test_billing"))
      .toBe(true);
    expect(urls.map((url) => url.searchParams.get("start_time")).sort()).toEqual(
      ["1782838800", "1784480400"],
    );
  });
});
