import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { readAiUsageRow } from "./usage-store";

type FakeResult = {
  data: Record<string, unknown> | null;
  error: { code?: string; message?: string } | null;
};

function fakeClient(results: FakeResult[], selections: string[]) {
  return {
    from: () => ({
      select: (selection: string) => {
        selections.push(selection);
        return {
          eq: () => ({
            maybeSingle: async () => results.shift()!,
          }),
        };
      },
    }),
  } as unknown as SupabaseClient;
}

describe("AI usage storage reads", () => {
  it("falls back to the legacy row when the monotonic column is missing", async () => {
    const selections: string[] = [];
    const client = fakeClient(
      [
        {
          data: null,
          error: {
            code: "PGRST204",
            message: "usage_floor_usd_micros is missing",
          },
        },
        {
          data: { actual_usd_micros: 115_000, request_count: 4 },
          error: null,
        },
      ],
      selections,
    );

    const result = await readAiUsageRow(
      client,
      "ai_usage_daily",
      "usage_date",
      "2026-07-22",
    );

    expect(result.error).toBeNull();
    expect(result.data).toMatchObject({
      actual_usd_micros: 115_000,
      usage_floor_usd_micros: 0,
    });
    expect(selections[0]).toContain("usage_floor_usd_micros");
    expect(selections[1]).not.toContain("usage_floor_usd_micros");
  });

  it("retries a transient read once without fabricating an empty row", async () => {
    const selections: string[] = [];
    const client = fakeClient(
      [
        { data: null, error: { code: "PGRST000", message: "temporary" } },
        { data: { actual_usd_micros: 110_000 }, error: null },
      ],
      selections,
    );

    const result = await readAiUsageRow(
      client,
      "ai_usage_daily",
      "usage_date",
      "2026-07-22",
    );

    expect(result).toMatchObject({
      data: { actual_usd_micros: 110_000 },
      error: null,
    });
    expect(selections).toHaveLength(2);
    expect(selections[1]).toContain("usage_floor_usd_micros");
  });

  it("returns the error after a failed retry", async () => {
    const selections: string[] = [];
    const client = fakeClient(
      [
        { data: null, error: { code: "PGRST000", message: "temporary" } },
        { data: null, error: { code: "PGRST000", message: "still down" } },
      ],
      selections,
    );

    const result = await readAiUsageRow(
      client,
      "ai_usage_daily",
      "usage_date",
      "2026-07-22",
    );

    expect(result.data).toBeNull();
    expect(result.error?.message).toBe("still down");
  });
});
