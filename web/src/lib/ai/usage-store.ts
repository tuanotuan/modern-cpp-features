import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiDailyUsageRow } from "./budget";

const AI_USAGE_SELECT =
  "actual_usd_micros, provider_usd_micros, provider_actual_baseline_usd_micros, usage_floor_usd_micros, provider_synced_at, request_count, input_tokens, output_tokens, last_model";
const LEGACY_AI_USAGE_SELECT =
  "actual_usd_micros, provider_usd_micros, provider_actual_baseline_usd_micros, provider_synced_at, request_count, input_tokens, output_tokens, last_model";

export type AiUsageReadError = { code?: string; message?: string };
export type AiUsageReadResult = {
  data: AiDailyUsageRow | null;
  error: AiUsageReadError | null;
};

export async function readAiUsageRow(
  client: SupabaseClient,
  table: "ai_usage_daily" | "ai_usage_monthly",
  column: "usage_date" | "month_start",
  value: string,
): Promise<AiUsageReadResult> {
  const read = () =>
    client.from(table).select(AI_USAGE_SELECT).eq(column, value).maybeSingle();
  let result = await read();
  if (!result.error) {
    return { data: result.data as AiDailyUsageRow | null, error: null };
  }

  if (!isMissingUsageFloorColumn(result.error)) {
    result = await read();
    if (!result.error) {
      return { data: result.data as AiDailyUsageRow | null, error: null };
    }
  }

  if (isMissingUsageFloorColumn(result.error)) {
    const legacy = await client
      .from(table)
      .select(LEGACY_AI_USAGE_SELECT)
      .eq(column, value)
      .maybeSingle();
    return {
      data: legacy.data
        ? { ...(legacy.data as AiDailyUsageRow), usage_floor_usd_micros: 0 }
        : null,
      error: legacy.error,
    };
  }

  return { data: null, error: result.error };
}

export function isMissingUsageFloorColumn(error: AiUsageReadError | null) {
  if (!error) return false;
  return (
    error.code === "42703" ||
    error.code === "PGRST204" ||
    error.message?.includes("usage_floor_usd_micros") === true
  );
}
