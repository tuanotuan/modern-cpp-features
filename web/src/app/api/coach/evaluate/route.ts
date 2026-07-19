import manifestJson from "@/generated/content-manifest.json";
import { coachRequestSchema } from "@/lib/ai/contracts";
import { CoachConfigurationError, evaluateWithGemini } from "@/lib/ai/gemini";
import { consumeCoachRequest } from "@/lib/ai/rate-limit";
import { contentManifestSchema } from "@/lib/content/schema";
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

  const question = manifest.questions.find(
    (item) => item.id === parsed.data.questionId && item.status === "verified",
  );
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
    const feedback = await evaluateWithGemini({
      question,
      lesson,
      candidateAnswer: parsed.data.answer,
    });
    const model = process.env.AI_MODEL || "gemini-3-flash-preview";

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
        model,
      });
      if (saveError) {
        console.error("AI coach history save failed", { code: saveError.code });
      }
    }

    return Response.json({ feedback, model });
  } catch (error) {
    if (error instanceof CoachConfigurationError) {
      return Response.json(
        { error: "AI coach chưa được cấu hình key.", code: "not_configured" },
        { status: 503 },
      );
    }

    const status = getProviderStatus(error);
    console.error("AI coach request failed", {
      name: error instanceof Error ? error.name : "UnknownError",
      status,
    });

    if (status === 429) {
      return Response.json(
        { error: "Free quota Gemini đang bận hoặc đã chạm giới hạn. Thử lại sau.", code: "provider_rate_limited" },
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
