import manifestJson from "@/generated/content-manifest.json";
import { contentManifestSchema } from "@/lib/content/schema";
import {
  activeQuestionIds,
  rowsToApprovals,
  type QuestionApprovalRow,
} from "@/lib/practice/approvals";
import {
  hasAnkiTransition,
  rowsToLearningStates,
  rowsToProgress,
  syncProgressSchema,
  type PracticeReviewRow,
  type QuestionLearningStateRow,
} from "@/lib/practice/cloud";
import { isAllowedPracticeUser } from "@/lib/supabase/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const manifest = contentManifestSchema.parse(manifestJson);

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Cloud sync chưa được cấu hình." }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || !isAllowedPracticeUser(authData.user)) {
    return Response.json({ error: "Cần đăng nhập GitHub để sync." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request không phải JSON hợp lệ." }, { status: 400 });
  }

  const parsed = syncProgressSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Progress payload không hợp lệ." }, { status: 400 });
  }

  const { data: approvalRows, error: approvalError } = await supabase
    .from("question_approvals")
    .select("question_id, question_version, source_hash");
  if (approvalError) {
    return Response.json({ error: "Không đọc được question approvals." }, { status: 502 });
  }
  const allowedQuestionIds = activeQuestionIds(
    manifest.questions,
    rowsToApprovals((approvalRows ?? []) as QuestionApprovalRow[]),
  );
  const questionById = new Map(
    manifest.questions.map((question) => [question.id, question]),
  );
  const invalidReview = parsed.data.reviews.some((review) => {
    if (!allowedQuestionIds.has(review.questionId)) return true;
    if (!hasAnkiTransition(review)) return false;
    const question = questionById.get(review.questionId);
    return (
      !question ||
      review.questionVersion !== question.version ||
      review.sourceHash !== question.sourceHash
    );
  });
  if (invalidReview) {
    return Response.json({ error: "Progress payload không hợp lệ." }, { status: 400 });
  }

  const orderedReviews = [...parsed.data.reviews]
    .sort(
      (left, right) =>
        left.reviewedOn.localeCompare(right.reviewedOn) ||
        left.questionId.localeCompare(right.questionId),
    );
  for (const review of orderedReviews) {
    const question = questionById.get(review.questionId)!;
    const { error } = await supabase.rpc("record_practice_review", {
      p_question_id: review.questionId,
      p_question_version: question.version,
      p_source_hash: question.sourceHash,
      p_reviewed_on: review.reviewedOn,
      p_rating: review.rating,
    });
    if (error) {
      return Response.json(
        { error: "Không ghi được Anki learning state." },
        { status: 502 },
      );
    }
  }

  const [reviewsResult, statesResult] = await Promise.all([
    supabase
      .from("practice_reviews")
      .select(
        "question_id, reviewed_on, rating, next_due_on, question_version, source_hash, learning_state_after, interval_days_after, lapse_count_after",
      )
      .order("reviewed_on", { ascending: false })
      .limit(1000),
    supabase
      .from("user_question_states")
      .select(
        "question_id, question_version, source_hash, learning_state, due_on, interval_days, review_count, lapse_count, last_rating, last_reviewed_on, is_suspended, is_leech, content_changed, history_reset_on",
      ),
  ]);
  if (reviewsResult.error || statesResult.error) {
    return Response.json({ error: "Không đọc được cloud progress." }, { status: 502 });
  }

  return Response.json({
    progress: rowsToProgress(
      (reviewsResult.data ?? []) as PracticeReviewRow[],
    ),
    questionStates: rowsToLearningStates(
      (statesResult.data ?? []) as QuestionLearningStateRow[],
    ),
  });
}
