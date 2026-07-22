import type { User } from "@supabase/supabase-js";

import type { AiDailyBudgetSnapshot } from "@/lib/ai/budget";
import {
  getRepoContentManifest,
  loadQuestionStoreManifest,
} from "@/lib/content/question-store-server";
import type { ContentManifest } from "@/lib/content/schema";
import {
  questionOverrideSelect,
  rowsToQuestionOverrides,
  type QuestionOverride,
  type QuestionOverrideRow,
} from "@/lib/content/question-overrides";
import {
  dailyBudgetRemainingPercent,
  dailyBudgetUsdMicros,
  reconciledUsageUsdMicros,
  vietnamUsageDate,
} from "@/lib/ai/usage";
import { isAllowedPracticeUser } from "@/lib/supabase/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { EMPTY_PROGRESS, type PracticeProgress } from "./scheduler";
import {
  rowsToLearningStates,
  rowsToProgress,
  type PracticeReviewRow,
  type QuestionLearningStateRow,
} from "./cloud";
import type { QuestionLearningState } from "./learning-state";
import {
  rowsToApprovals,
  type QuestionApproval,
  type QuestionApprovalRow,
} from "./approvals";

export type PracticeAccount = {
  id: string;
  displayName: string;
  login: string | null;
};

export type CloudContext = {
  enabled: boolean;
  account: PracticeAccount | null;
  progress: PracticeProgress;
  questionStates: QuestionLearningState[];
  approvals: QuestionApproval[];
  questionOverrides: QuestionOverride[];
  manifest: ContentManifest;
  aiUsage: AiUsageSummary | null;
  geminiUsage: GeminiUsageSummary | null;
  geminiFallbackEnabled: boolean;
  aiDailyBudget: AiDailyBudgetSnapshot | null;
  generationJobs: ContentGenerationJobSummary[];
  error: boolean;
};

export type ContentGenerationJobSummary = {
  id: number;
  lessonId: string;
  sourceHash: string;
  status: "pending" | "running" | "deferred" | "completed" | "failed" | "dead_letter";
  attemptCount: number;
  requestedCount: number;
  provider: string;
  model: string;
  nextAttemptAt: string;
  lastError: Record<string, unknown> | null;
  updatedAt: string;
};

export type AiUsageSummary = {
  actualUsdMicros: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  lastModel: string | null;
};

export type GeminiUsageSummary = {
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
  lastModel: string | null;
};

export async function loadCloudContext(
  { includeGenerationJobs = false }: { includeGenerationJobs?: boolean } = {},
): Promise<CloudContext> {
  if (!isSupabaseConfigured()) {
    return {
      enabled: false,
      account: null,
      progress: EMPTY_PROGRESS,
      questionStates: [],
      approvals: [],
      questionOverrides: [],
      manifest: getRepoContentManifest(),
      aiUsage: null,
      geminiUsage: null,
      geminiFallbackEnabled: false,
      aiDailyBudget: null,
      generationJobs: [],
      error: false,
    };
  }

  const supabase = await createSupabaseServerClient();
  const { data, error: authError } = await supabase.auth.getUser();
  if (authError || !data.user || !isAllowedPracticeUser(data.user)) {
    return {
      enabled: true,
      account: null,
      progress: EMPTY_PROGRESS,
      questionStates: [],
      approvals: [],
      questionOverrides: [],
      manifest: getRepoContentManifest(),
      aiUsage: null,
      geminiUsage: null,
      geminiFallbackEnabled: false,
      aiDailyBudget: null,
      generationJobs: [],
      error: false,
    };
  }

  const usageDate = vietnamUsageDate();
  const [reviewsResult, statesResult, approvalsResult, overridesResult, monthlyUsageResult, dailyUsageResult, geminiUsageResult, providerSettingsResult] =
    await Promise.all([
      supabase
        .from("practice_reviews")
        .select("question_id, reviewed_on, rating, next_due_on, question_version, source_hash, learning_state_after, interval_days_after, lapse_count_after")
        .order("reviewed_on", { ascending: false })
        .limit(1000),
      supabase
        .from("user_question_states")
        .select("question_id, question_version, source_hash, learning_state, due_on, interval_days, review_count, lapse_count, last_rating, last_reviewed_on, is_suspended, is_leech, content_changed, history_reset_on"),
      supabase
        .from("question_approvals")
        .select("question_id, question_version, source_hash"),
      supabase
        .from("question_overrides")
        .select(questionOverrideSelect),
      supabase
        .from("ai_usage_monthly")
        .select("actual_usd_micros, provider_usd_micros, provider_actual_baseline_usd_micros, usage_floor_usd_micros, provider_synced_at, request_count, input_tokens, output_tokens, last_model")
        .eq("month_start", `${usageDate.slice(0, 7)}-01`)
        .maybeSingle(),
      supabase
        .from("ai_usage_daily")
        .select("actual_usd_micros, provider_usd_micros, provider_actual_baseline_usd_micros, usage_floor_usd_micros, provider_synced_at, request_count, input_tokens, output_tokens, last_model")
        .eq("usage_date", usageDate)
        .maybeSingle(),
      supabase
        .from("gemini_usage_daily")
        .select("request_count, input_tokens, output_tokens, thought_tokens, total_tokens, last_model")
        .eq("usage_date", usageDate)
        .maybeSingle(),
      supabase
        .from("ai_provider_settings")
        .select("gemini_fallback_enabled")
        .maybeSingle(),
    ]);
  const { data: rows, error } = reviewsResult;
  const { data: stateRows, error: statesError } = statesResult;
  const { data: approvalRows, error: approvalError } = approvalsResult;
  const { data: overrideRows, error: overridesError } = overridesResult;
  const { data: usageRow, error: usageError } = monthlyUsageResult;
  const { data: dailyUsageRow, error: dailyUsageError } = dailyUsageResult;
  const { data: geminiUsageRow, error: geminiUsageError } = geminiUsageResult;
  const { data: providerSettingsRow, error: providerSettingsError } =
    providerSettingsResult;
  const generationJobsResult = includeGenerationJobs
    ? await supabase
        .from("content_generation_jobs")
        .select(
          "id, lesson_id, source_hash, status, attempt_count, requested_count, provider, model, next_attempt_at, last_error, updated_at",
        )
        .order("updated_at", { ascending: false })
        .limit(50)
    : { data: [], error: null };
  const { data: generationJobRows, error: generationJobsError } =
    generationJobsResult;
  const dailyBillingUsdMicros = dailyUsageRow?.provider_synced_at
    ? Number(dailyUsageRow.provider_usd_micros ?? 0)
    : null;
  const dailyActualUsdMicros = reconciledUsageUsdMicros({
    realtimeUsdMicros: Number(dailyUsageRow?.actual_usd_micros ?? 0),
    providerUsdMicros: dailyBillingUsdMicros ?? 0,
    realtimeBaselineUsdMicros: Number(
      dailyUsageRow?.provider_actual_baseline_usd_micros ?? 0,
    ),
    usageFloorUsdMicros: Number(dailyUsageRow?.usage_floor_usd_micros ?? 0),
    providerSynced: dailyBillingUsdMicros !== null,
  });
  const questionOverrides = overridesError
    ? []
    : rowsToQuestionOverrides((overrideRows ?? []) as QuestionOverrideRow[]);
  const manifest = await loadQuestionStoreManifest({
    supabase,
    overrides: questionOverrides,
  });

  return {
    enabled: true,
    account: toPracticeAccount(data.user),
    progress: error
      ? EMPTY_PROGRESS
      : rowsToProgress((rows ?? []) as PracticeReviewRow[]),
    questionStates: statesError
      ? []
      : rowsToLearningStates(
          (stateRows ?? []) as QuestionLearningStateRow[],
        ),
    approvals: approvalError
      ? []
      : rowsToApprovals((approvalRows ?? []) as QuestionApprovalRow[]),
    questionOverrides,
    manifest,
    aiUsage: usageRow
      ? {
          actualUsdMicros: reconciledUsageUsdMicros({
            realtimeUsdMicros: Number(usageRow.actual_usd_micros),
            providerUsdMicros: Number(usageRow.provider_usd_micros ?? 0),
            realtimeBaselineUsdMicros: Number(
              usageRow.provider_actual_baseline_usd_micros ?? 0,
            ),
            usageFloorUsdMicros: Number(
              usageRow.usage_floor_usd_micros ?? 0,
            ),
            providerSynced:
              typeof usageRow.provider_synced_at === "string",
          }),
          requestCount: Number(usageRow.request_count),
          inputTokens: Number(usageRow.input_tokens),
          outputTokens: Number(usageRow.output_tokens),
          lastModel:
            typeof usageRow.last_model === "string" ? usageRow.last_model : null,
        }
      : null,
    geminiUsage: geminiUsageRow
      ? {
          requestCount: Number(geminiUsageRow.request_count),
          inputTokens: Number(geminiUsageRow.input_tokens),
          outputTokens: Number(geminiUsageRow.output_tokens),
          thoughtTokens: Number(geminiUsageRow.thought_tokens),
          totalTokens: Number(geminiUsageRow.total_tokens),
          lastModel:
            typeof geminiUsageRow.last_model === "string"
              ? geminiUsageRow.last_model
              : null,
        }
      : null,
    geminiFallbackEnabled:
      Boolean(process.env.GEMINI_API_KEY) &&
      process.env.GEMINI_FALLBACK_ENABLED?.toLowerCase() !== "false" &&
      providerSettingsRow?.gemini_fallback_enabled !== false,
    aiDailyBudget: {
      actualUsdMicros: dailyActualUsdMicros,
      billingUsdMicros: dailyBillingUsdMicros,
      billingSyncedAt:
        typeof dailyUsageRow?.provider_synced_at === "string"
          ? dailyUsageRow.provider_synced_at
          : null,
      requestCount: Number(dailyUsageRow?.request_count ?? 0),
      inputTokens: Number(dailyUsageRow?.input_tokens ?? 0),
      outputTokens: Number(dailyUsageRow?.output_tokens ?? 0),
      lastModel:
        typeof dailyUsageRow?.last_model === "string"
          ? dailyUsageRow.last_model
          : null,
      limitUsdMicros: dailyBudgetUsdMicros(),
      remainingPercent: dailyBudgetRemainingPercent(dailyActualUsdMicros),
      usageDate,
    },
    generationJobs: generationJobsError
      ? []
      : (generationJobRows ?? []).flatMap((row) => {
          const status = generationJobStatus(row.status);
          if (!status) return [];
          return [{
            id: Number(row.id),
            lessonId: String(row.lesson_id),
            sourceHash: String(row.source_hash),
            status,
            attemptCount: Number(row.attempt_count),
            requestedCount: Number(row.requested_count),
            provider: String(row.provider),
            model: String(row.model),
            nextAttemptAt: String(row.next_attempt_at),
            lastError:
              typeof row.last_error === "object" && row.last_error !== null
                ? row.last_error as Record<string, unknown>
                : null,
            updatedAt: String(row.updated_at),
          }];
        }),
    error: Boolean(
      error ||
        statesError ||
        approvalError ||
        overridesError ||
        usageError ||
        dailyUsageError ||
        geminiUsageError ||
        providerSettingsError ||
        generationJobsError,
    ),
  };
}

function generationJobStatus(value: unknown): ContentGenerationJobSummary["status"] | null {
  return ["pending", "running", "deferred", "completed", "failed", "dead_letter"].includes(
    String(value),
  )
    ? String(value) as ContentGenerationJobSummary["status"]
    : null;
}

function toPracticeAccount(user: User): PracticeAccount {
  const login = stringMetadata(user.user_metadata.user_name);
  const displayName =
    stringMetadata(user.user_metadata.full_name) || login || user.email || "GitHub user";
  return { id: user.id, displayName, login };
}

function stringMetadata(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}
