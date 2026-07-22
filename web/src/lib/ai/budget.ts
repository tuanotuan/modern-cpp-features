import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiTokenUsage } from "./usage";
import { syncOpenAiBilling } from "./billing";
import { readAiUsageRow } from "./usage-store";
import {
  dailyBudgetRemainingPercent,
  dailyBudgetUsdMicros,
  monthlyBudgetUsdMicros,
  reconciledUsageUsdMicros,
  usageCostUsdMicros,
  vietnamUsageDate,
} from "./usage";

export type AiBudgetReservation = {
  client: SupabaseClient | null;
  reservedUsdMicros: number;
  usageDate: string | null;
  monthStart: string | null;
};

export class AiMonthlyBudgetExceededError extends Error {}
export class AiDailyBudgetExceededError extends Error {}
export class AiBudgetConfigurationError extends Error {}

export type AiDailyBudgetSnapshot = {
  actualUsdMicros: number;
  billingUsdMicros: number | null;
  billingSyncedAt: string | null;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  lastModel: string | null;
  limitUsdMicros: number;
  remainingPercent: number;
  usageDate: string;
};

export type AiDailyUsageRow = {
  actual_usd_micros?: unknown;
  provider_usd_micros?: unknown;
  provider_actual_baseline_usd_micros?: unknown;
  usage_floor_usd_micros?: unknown;
  provider_synced_at?: unknown;
  request_count?: unknown;
  input_tokens?: unknown;
  output_tokens?: unknown;
  last_model?: unknown;
};

export function mergeAiDailyBudgetSnapshot(
  current: AiDailyBudgetSnapshot | null,
  incoming: AiDailyBudgetSnapshot,
): AiDailyBudgetSnapshot {
  if (!current) return incoming;
  if (current.usageDate !== incoming.usageDate) {
    return incoming.usageDate > current.usageDate ? incoming : current;
  }
  return {
    ...incoming,
    actualUsdMicros: Math.max(
      current.actualUsdMicros,
      incoming.actualUsdMicros,
    ),
    requestCount: Math.max(current.requestCount, incoming.requestCount),
    inputTokens: Math.max(current.inputTokens, incoming.inputTokens),
    outputTokens: Math.max(current.outputTokens, incoming.outputTokens),
    remainingPercent: Math.min(
      current.remainingPercent,
      incoming.remainingPercent,
    ),
  };
}

export function aiDailyBudgetSnapshotFromUsageRead({
  row,
  readError,
  usageDate,
  fallbackActualUsdMicros = 0,
}: {
  row: AiDailyUsageRow | null;
  readError?: unknown;
  usageDate: string;
  fallbackActualUsdMicros?: number;
}): AiDailyBudgetSnapshot | null {
  if (readError) return null;

  const estimated = Number(
    row?.actual_usd_micros ?? fallbackActualUsdMicros,
  );
  const billing = typeof row?.provider_synced_at === "string"
    ? Number(row.provider_usd_micros ?? 0)
    : null;
  const used = reconciledUsageUsdMicros({
    realtimeUsdMicros: estimated,
    providerUsdMicros: billing ?? 0,
    realtimeBaselineUsdMicros: Number(
      row?.provider_actual_baseline_usd_micros ?? 0,
    ),
    usageFloorUsdMicros: Number(row?.usage_floor_usd_micros ?? 0),
    providerSynced: billing !== null,
  });

  return {
    actualUsdMicros: used,
    billingUsdMicros: billing,
    billingSyncedAt:
      typeof row?.provider_synced_at === "string"
        ? row.provider_synced_at
        : null,
    requestCount: Number(row?.request_count ?? 0),
    inputTokens: Number(row?.input_tokens ?? 0),
    outputTokens: Number(row?.output_tokens ?? 0),
    lastModel: typeof row?.last_model === "string" ? row.last_model : null,
    limitUsdMicros: dailyBudgetUsdMicros(),
    remainingPercent: dailyBudgetRemainingPercent(used),
    usageDate,
  };
}

export async function withAiBudget<T extends { model: string; usage: AiTokenUsage }>(
  client: SupabaseClient | null,
  reservedUsdMicros: number,
  operation: () => Promise<T>,
) {
  if (client) await syncOpenAiBilling(client);
  const reservation = await reserveAiBudget(client, reservedUsdMicros);
  try {
    const result = await operation();
    const dailyBudget = await finalizeAiBudget(reservation, result.model, result.usage);
    return { result, dailyBudget };
  } catch (error) {
    await releaseAiBudget(reservation);
    throw error;
  }
}

export async function reserveAiBudget(
  client: SupabaseClient | null,
  reservedUsdMicros: number,
): Promise<AiBudgetReservation> {
  if (!client) {
    return { client, reservedUsdMicros: 0, usageDate: null, monthStart: null };
  }

  const { data, error } = await client.rpc("reserve_ai_budget", {
    p_daily_limit_usd_micros: dailyBudgetUsdMicros(),
    p_monthly_limit_usd_micros: monthlyBudgetUsdMicros(),
    p_reservation_usd_micros: reservedUsdMicros,
  });
  if (error) {
    console.error("AI budget reservation failed", { code: error.code });
    throw new AiBudgetConfigurationError("AI budget migration is missing");
  }
  const decision = parseBudgetDecision(data);
  if (decision.status === "daily_exceeded") {
    throw new AiDailyBudgetExceededError("Daily AI budget reached");
  }
  if (decision.status !== "allowed") {
    throw new AiMonthlyBudgetExceededError("Monthly AI budget reached");
  }
  return {
    client,
    reservedUsdMicros,
    usageDate: decision.usageDate,
    monthStart: decision.monthStart,
  };
}

export async function finalizeAiBudget(
  reservation: AiBudgetReservation,
  model: string,
  usage: AiTokenUsage,
) {
  if (!reservation.client || reservation.reservedUsdMicros === 0) return null;
  const actualUsdMicros = usageCostUsdMicros(model, usage);
  const { error } = await reservation.client.rpc("finalize_ai_budget", {
    p_actual_usd_micros: actualUsdMicros,
    p_cache_write_tokens: usage.cacheWriteTokens,
    p_cached_input_tokens: usage.cachedInputTokens,
    p_input_tokens: usage.inputTokens,
    p_model: model,
    p_output_tokens: usage.outputTokens,
    p_reservation_usd_micros: reservation.reservedUsdMicros,
    p_usage_date: reservation.usageDate,
    p_month_start: reservation.monthStart,
  });
  if (error) {
    console.error("AI budget finalization failed", { code: error.code });
    return null;
  }
  const usageDate = reservation.usageDate ?? vietnamUsageDate();
  const { data: dailyRow, error: readError } = await readAiUsageRow(
    reservation.client,
    "ai_usage_daily",
    "usage_date",
    usageDate,
  );
  if (readError) {
    console.error("Daily AI budget read failed", { code: readError.code });
    return null;
  }
  const snapshot = aiDailyBudgetSnapshotFromUsageRead({
    row: dailyRow,
    usageDate,
    fallbackActualUsdMicros: actualUsdMicros,
  });
  if (!snapshot) return null;
  console.info("AI usage finalized", {
    model,
    inputTokens: usage.inputTokens,
    outputTokens: usage.outputTokens,
    actualUsdMicros,
    dailyActualUsdMicros: snapshot.actualUsdMicros,
    requestCount: snapshot.requestCount,
    remainingPercent: snapshot.remainingPercent,
  });
  return snapshot;
}

export async function releaseAiBudget(reservation: AiBudgetReservation) {
  if (!reservation.client || reservation.reservedUsdMicros === 0) return;
  const { error } = await reservation.client.rpc("release_ai_budget", {
    p_month_start: reservation.monthStart,
    p_reservation_usd_micros: reservation.reservedUsdMicros,
    p_usage_date: reservation.usageDate,
  });
  if (error) console.error("AI budget release failed", { code: error.code });
}

function parseBudgetDecision(data: unknown) {
  if (typeof data !== "object" || data === null) {
    throw new AiBudgetConfigurationError("Unexpected AI budget response");
  }
  const value = data as Record<string, unknown>;
  const status = typeof value.status === "string" ? value.status : "invalid";
  const usageDate = typeof value.usage_date === "string" ? value.usage_date : null;
  const monthStart = typeof value.month_start === "string" ? value.month_start : null;
  if (status === "allowed" && (!usageDate || !monthStart)) {
    throw new AiBudgetConfigurationError("AI budget period is missing");
  }
  return { status, usageDate, monthStart };
}
