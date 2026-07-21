import type { SupabaseClient } from "@supabase/supabase-js";

import type { GeminiTokenUsage } from "./gemini";

export async function recordGeminiFallbackUsage(
  client: SupabaseClient | null,
  model: string,
  usage: GeminiTokenUsage,
) {
  if (!client) return;

  const { error } = await client.rpc("record_gemini_fallback_usage", {
    p_input_tokens: usage.inputTokens,
    p_model: model,
    p_output_tokens: usage.outputTokens,
    p_thought_tokens: usage.thoughtTokens,
    p_total_tokens: usage.totalTokens,
  });
  if (error) {
    console.error("Gemini fallback usage save failed", { code: error.code });
  }
}

