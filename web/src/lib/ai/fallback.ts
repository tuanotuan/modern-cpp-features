import type { SupabaseClient } from "@supabase/supabase-js";

import {
  AiDailyBudgetExceededError,
  AiMonthlyBudgetExceededError,
} from "./budget";
import {
  type GeminiStructuredResult,
} from "./gemini";
import { recordGeminiFallbackUsage } from "./gemini-usage";

export class AllAiQuotasExceededError extends Error {}
export class GeminiFallbackProviderError extends Error {
  constructor(options?: ErrorOptions) {
    super("Gemini fallback request failed", options);
  }
}

export function isOpenAiAppBudgetError(error: unknown) {
  return (
    error instanceof AiDailyBudgetExceededError ||
    error instanceof AiMonthlyBudgetExceededError
  );
}

export async function runGeminiBudgetFallback<T>(
  budgetError: unknown,
  client: SupabaseClient | null,
  operation: () => Promise<GeminiStructuredResult<T>>,
) {
  if (
    !isOpenAiAppBudgetError(budgetError) ||
    !(await isGeminiFallbackEnabled(client))
  ) {
    throw budgetError;
  }

  try {
    const result = await operation();
    await recordGeminiFallbackUsage(client, result.model, result.usage);
    return result;
  } catch (error) {
    if (providerStatus(error) === 429) {
      throw new AllAiQuotasExceededError(
        "OpenAI app budget and Gemini provider quota are exhausted",
      );
    }
    throw new GeminiFallbackProviderError({ cause: error });
  }
}

export async function isGeminiFallbackEnabled(client: SupabaseClient | null) {
  if (
    !process.env.GEMINI_API_KEY ||
    process.env.GEMINI_FALLBACK_ENABLED?.toLowerCase() === "false"
  ) {
    return false;
  }
  if (!client) return true;

  const { data, error } = await client
    .from("ai_provider_settings")
    .select("gemini_fallback_enabled")
    .maybeSingle();
  if (error) {
    console.error("Gemini fallback setting read failed", { code: error.code });
    return false;
  }
  return data?.gemini_fallback_enabled !== false;
}

function providerStatus(error: unknown) {
  if (typeof error !== "object" || error === null || !("status" in error)) {
    return undefined;
  }
  return typeof error.status === "number" ? error.status : undefined;
}
