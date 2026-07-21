import manifestJson from "@/generated/content-manifest.json";
import {
  AiBudgetConfigurationError,
  AiDailyBudgetExceededError,
  AiMonthlyBudgetExceededError,
  withAiBudget,
} from "@/lib/ai/budget";
import { coachRequestSchema } from "@/lib/ai/contracts";
import {
  AllAiQuotasExceededError,
  GeminiFallbackProviderError,
  runGeminiBudgetFallback,
} from "@/lib/ai/fallback";
import { evaluateWithGemini } from "@/lib/ai/gemini";
import {
  CoachConfigurationError,
  evaluateWithOpenAI,
  safetyIdentifier,
} from "@/lib/ai/openai";
import { consumeCoachRequest } from "@/lib/ai/rate-limit";
import { COACH_RESERVATION_USD_MICROS } from "@/lib/ai/usage";
import { contentManifestSchema } from "@/lib/content/schema";
import {
  isQuestionApproved,
  rowsToApprovals,
  type QuestionApproval,
  type QuestionApprovalRow,
} from "@/lib/practice/approvals";
import { isAllowedPracticeUser } from "@/lib/supabase/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const manifest = contentManifestSchema.parse(manifestJson);

export async function POST(request: Request) {
  const clientKey =
    request.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    request.headers.get("x-real-ip") ||
    "local";
  const limit = consumeCoachRequest(clientKey);

  if (!limit.allowed) {
    return Response.json(
      { error: "Mày gọi AI hơi nhanh. Chờ một chút rồi thử lại.", code: "rate_limited" },
      {
        status: 429,
        headers: { "Retry-After": String(limit.retryAfterSeconds) },
      },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: "Request không phải JSON hợp lệ.", code: "invalid_json" },
      { status: 400 },
    );
  }

  const parsed = coachRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      {
        error: "Câu trả lời cần ít nhất 10 ký tự và không quá 6.000 ký tự.",
        code: "invalid_request",
      },
      { status: 400 },
    );
  }

  const supabase = isSupabaseConfigured()
    ? await createSupabaseServerClient()
    : null;
  const authResult = supabase ? await supabase.auth.getUser() : null;
  if (
    supabase &&
    (authResult?.error ||
      !authResult?.data.user ||
      !isAllowedPracticeUser(authResult.data.user))
  ) {
    return Response.json(
      { error: "Đăng nhập GitHub để dùng AI coach.", code: "authentication_required" },
      { status: 401 },
    );
  }

  let approvals: QuestionApproval[] = [];
  if (supabase) {
    const { data: approvalRows, error: approvalError } = await supabase
      .from("question_approvals")
      .select("question_id, question_version, source_hash");
    if (approvalError) {
      return Response.json(
        { error: "Không đọc được question approvals.", code: "approval_lookup_failed" },
        { status: 502 },
      );
    }
    approvals = rowsToApprovals((approvalRows ?? []) as QuestionApprovalRow[]);
  }

  const question = manifest.questions.find((item) => {
    if (item.id !== parsed.data.questionId) return false;
    return item.status === "verified" || isQuestionApproved(item, approvals);
  });
  if (!question) {
    return Response.json(
      { error: "Không tìm thấy câu hỏi đã duyệt.", code: "question_not_found" },
      { status: 404 },
    );
  }

  const lesson = manifest.lessons.find((item) => item.id === question.lessonId);
  if (!lesson) {
    return Response.json(
      { error: "Lesson nguồn đang thiếu.", code: "lesson_not_found" },
      { status: 500 },
    );
  }

  try {
    let provider: "openai" | "gemini" = "openai";
    let dailyBudget = null;
    let result;
    try {
      const openAiResult = await withAiBudget(
        supabase,
        COACH_RESERVATION_USD_MICROS.luna,
        () =>
          evaluateWithOpenAI({
            question,
            lesson,
            candidateAnswer: parsed.data.answer,
            safetyIdentifier: safetyIdentifier(
              authResult?.data.user?.id || clientKey,
            ),
          }),
      );
      result = openAiResult.result;
      dailyBudget = openAiResult.dailyBudget;
    } catch (error) {
      result = await runGeminiBudgetFallback(error, supabase, () =>
        evaluateWithGemini({
          question,
          lesson,
          candidateAnswer: parsed.data.answer,
        }),
      );
      provider = "gemini";
    }
    const { data: feedback, model } = result;
    const modelLabel =
      provider === "gemini" ? `Gemini fallback · ${model}` : model;

    if (supabase && authResult?.data.user) {
      const { error: saveError } = await supabase.from("coach_attempts").insert({
        user_id: authResult.data.user.id,
        question_id: question.id,
        question_version: question.version,
        source_commit_sha: manifest.sourceRevision,
        candidate_answer: parsed.data.answer,
        score: feedback.score,
        verdict: feedback.verdict,
        suggested_rating: feedback.suggestedRating,
        feedback,
        model: modelLabel,
      });
      if (saveError) {
        console.error("AI coach history save failed", { code: saveError.code });
      }
    }

    return Response.json({
      feedback,
      model: modelLabel,
      provider,
      aiDailyBudget: dailyBudget,
    });
  } catch (error) {
    if (error instanceof AllAiQuotasExceededError) {
      return Response.json(
        {
          error: "OpenAI đã hết quota và Gemini Free cũng đang bận hoặc hết quota. Thử lại sau nhé.",
          code: "all_ai_quotas_exceeded",
        },
        { status: 429 },
      );
    }
    if (error instanceof GeminiFallbackProviderError) {
      console.error("Gemini fallback coach request failed", {
        name: error.cause instanceof Error ? error.cause.name : "UnknownError",
      });
      return Response.json(
        {
          error: "Gemini fallback chưa trả lời được. Thử lại sau nhé.",
          code: "fallback_provider_error",
        },
        { status: 502 },
      );
    }
    if (error instanceof CoachConfigurationError) {
      return Response.json(
        { error: "AI coach chưa được cấu hình key.", code: "not_configured" },
        { status: 503 },
      );
    }

    if (error instanceof AiMonthlyBudgetExceededError) {
      return Response.json(
        {
          error: "Đã chạm ngân sách AI tháng này. Website sẽ không gọi thêm để giữ giới hạn chi tiêu.",
          code: "monthly_budget_exceeded",
        },
        { status: 429 },
      );
    }

    if (error instanceof AiDailyBudgetExceededError) {
      return Response.json(
        {
          error: "Đã dùng hết quota AI hôm nay. Quota sẽ tự reset lúc 00:00 giờ Việt Nam.",
          code: "daily_budget_exceeded",
        },
        { status: 429 },
      );
    }

    if (error instanceof AiBudgetConfigurationError) {
      return Response.json(
        {
          error: "Bộ giới hạn chi phí AI chưa được cài trong Supabase.",
          code: "budget_not_configured",
        },
        { status: 503 },
      );
    }

    const status = getProviderStatus(error);
    const providerCode = getProviderCode(error);
    console.error("AI coach request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      status,
    });

    if (providerCode === "insufficient_quota") {
      return Response.json(
        { error: "OpenAI project chưa có credit hoặc đã dùng hết ngân sách tháng.", code: "provider_quota_exceeded" },
        { status: 429 },
      );
    }

    if (status === 429) {
      return Response.json(
        { error: "OpenAI đang giới hạn tạm thời hoặc project đã chạm ngân sách. Thử lại sau.", code: "provider_rate_limited" },
        { status: 429 },
      );
    }

    return Response.json(
      { error: "AI coach chưa trả lời được. Thử lại sau nhé.", code: "provider_error" },
      { status: 502 },
    );
  }
}

function getProviderStatus(error: unknown): number | undefined {
  if (typeof error !== "object" || error === null || !("status" in error)) return undefined;
  return typeof error.status === "number" ? error.status : undefined;
}

function getProviderCode(error: unknown): string | undefined {
  if (typeof error !== "object" || error === null || !("code" in error)) return undefined;
  return typeof error.code === "string" ? error.code : undefined;
}
