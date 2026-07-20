export type AiTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  cacheWriteTokens: number;
};

type ModelRates = {
  input: number;
  cachedInput: number;
  cacheWrite: number;
  output: number;
};

const MODEL_RATES_USD_PER_MILLION: Record<string, ModelRates> = {
  "gpt-5.6-luna": {
    input: 1,
    cachedInput: 0.1,
    cacheWrite: 1.25,
    output: 6,
  },
  "gpt-5.6-terra": {
    input: 2.5,
    cachedInput: 0.25,
    cacheWrite: 3.125,
    output: 15,
  },
};

export const COACH_RESERVATION_USD_MICROS = {
  luna: 100_000,
  terra: 150_000,
} as const;

export function usageCostUsdMicros(model: string, usage: AiTokenUsage) {
  const rates = MODEL_RATES_USD_PER_MILLION[model];
  if (!rates) {
    throw new Error(`No pricing configured for OpenAI model ${model}`);
  }

  const cached = Math.max(0, usage.cachedInputTokens);
  const cacheWrite = Math.max(0, usage.cacheWriteTokens);
  const uncached = Math.max(0, usage.inputTokens - cached - cacheWrite);
  return Math.ceil(
    uncached * rates.input +
      cached * rates.cachedInput +
      cacheWrite * rates.cacheWrite +
      Math.max(0, usage.outputTokens) * rates.output,
  );
}

export function monthlyBudgetUsdMicros() {
  const dollars = Number(process.env.OPENAI_MONTHLY_BUDGET_USD ?? "5");
  if (!Number.isFinite(dollars) || dollars <= 0 || dollars > 100) {
    throw new Error("OPENAI_MONTHLY_BUDGET_USD must be between 0 and 100");
  }
  return Math.floor(dollars * 1_000_000);
}
