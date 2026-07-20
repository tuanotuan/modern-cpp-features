import type { User } from "@supabase/supabase-js";

import { isAllowedPracticeUser } from "@/lib/supabase/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

import { EMPTY_PROGRESS, type PracticeProgress } from "./scheduler";
import { rowsToProgress, type PracticeReviewRow } from "./cloud";
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
  approvals: QuestionApproval[];
  aiUsage: AiUsageSummary | null;
  error: boolean;
};

export type AiUsageSummary = {
  actualUsdMicros: number;
  requestCount: number;
  inputTokens: number;
  outputTokens: number;
  lastModel: string | null;
};

export async function loadCloudContext(): Promise<CloudContext> {
  if (!isSupabaseConfigured()) {
    return {
      enabled: false,
      account: null,
      progress: EMPTY_PROGRESS,
      approvals: [],
      aiUsage: null,
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
      approvals: [],
      aiUsage: null,
      error: false,
    };
  }

  const { data: rows, error } = await supabase
    .from("practice_reviews")
    .select("question_id, reviewed_on, rating, next_due_on")
    .order("reviewed_on", { ascending: false })
    .limit(1000);
  const { data: approvalRows, error: approvalError } = await supabase
    .from("question_approvals")
    .select("question_id, question_version, source_hash");
  const { data: usageRow } = await supabase
    .from("ai_usage_monthly")
    .select("actual_usd_micros, request_count, input_tokens, output_tokens, last_model")
    .eq("month_start", new Date().toISOString().slice(0, 7) + "-01")
    .maybeSingle();

  return {
    enabled: true,
    account: toPracticeAccount(data.user),
    progress: error
      ? EMPTY_PROGRESS
      : rowsToProgress((rows ?? []) as PracticeReviewRow[]),
    approvals: approvalError
      ? []
      : rowsToApprovals((approvalRows ?? []) as QuestionApprovalRow[]),
    aiUsage: usageRow
      ? {
          actualUsdMicros: Number(usageRow.actual_usd_micros),
          requestCount: Number(usageRow.request_count),
          inputTokens: Number(usageRow.input_tokens),
          outputTokens: Number(usageRow.output_tokens),
          lastModel:
            typeof usageRow.last_model === "string" ? usageRow.last_model : null,
        }
      : null,
    error: Boolean(error || approvalError),
  };
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
