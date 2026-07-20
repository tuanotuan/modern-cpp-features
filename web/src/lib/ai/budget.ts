import type { SupabaseClient } from "@supabase/supabase-js";

import type { AiTokenUsage } from "./usage";
import { monthlyBudgetUsdMicros, usageCostUsdMicros } from "./usage";

export type AiBudgetReservation = {
  client: SupabaseClient | null;
  reservedUsdMicros: number;
};

export class AiMonthlyBudgetExceededError extends Error {}
export class AiBudgetConfigurationError extends Error {}

export async function withAiBudget<T extends { model: string; usage: AiTokenUsage }>(
  client: SupabaseClient | null,
  reservedUsdMicros: number,
  operation: () => Promise<T>,
) {
  const reservation = await reserveAiBudget(client, reservedUsdMicros);
  try {
    const result = await operation();
    await finalizeAiBudget(reservation, result.model, result.usage);
    return result;
  } catch (error) {
    await releaseAiBudget(reservation);
    throw error;
  }
}

export async function reserveAiBudget(
  client: SupabaseClient | null,
  reservedUsdMicros: number,
): Promise<AiBudgetReservation> {
  if (!client) return { client, reservedUsdMicros: 0 };

  const { data, error } = await client.rpc("reserve_ai_budget", {
    p_limit_usd_micros: monthlyBudgetUsdMicros(),
    p_reservation_usd_micros: reservedUsdMicros,
  });
  if (error) {
    console.error("AI budget reservation failed", { code: error.code });
    throw new AiBudgetConfigurationError("AI budget migration is missing");
  }
  if (data !== true) {
    throw new AiMonthlyBudgetExceededError("Monthly AI budget reached");
  }
  return { client, reservedUsdMicros };
}

export async function finalizeAiBudget(
  reservation: AiBudgetReservation,
  model: string,
  usage: AiTokenUsage,
) {
  if (!reservation.client || reservation.reservedUsdMicros === 0) return;
  const actualUsdMicros = usageCostUsdMicros(model, usage);
  const { error } = await reservation.client.rpc("finalize_ai_budget", {
    p_actual_usd_micros: actualUsdMicros,
    p_cache_write_tokens: usage.cacheWriteTokens,
    p_cached_input_tokens: usage.cachedInputTokens,
    p_input_tokens: usage.inputTokens,
    p_model: model,
    p_output_tokens: usage.outputTokens,
    p_reservation_usd_micros: reservation.reservedUsdMicros,
  });
  if (error) {
    console.error("AI budget finalization failed", { code: error.code });
  }
}

export async function releaseAiBudget(reservation: AiBudgetReservation) {
  if (!reservation.client || reservation.reservedUsdMicros === 0) return;
  const { error } = await reservation.client.rpc("release_ai_budget", {
    p_reservation_usd_micros: reservation.reservedUsdMicros,
  });
  if (error) console.error("AI budget release failed", { code: error.code });
}
