import { z } from "zod";

import manifestJson from "@/generated/content-manifest.json";
import { applyQuestionOverrides } from "@/lib/content/question-overrides";
import { loadQuestionOverrides } from "@/lib/content/question-overrides-server";
import { contentManifestSchema } from "@/lib/content/schema";
import {
  rowsToLearningStates,
  rowsToProgress,
  type PracticeReviewRow,
  type QuestionLearningStateRow,
} from "@/lib/practice/cloud";
import { isAllowedPracticeUser } from "@/lib/supabase/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const baseManifest = contentManifestSchema.parse(manifestJson);
const requestSchema = z
  .object({
    questionId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/),
    action: z.enum(["suspend", "unsuspend", "reset", "reschedule"]),
    dueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  })
  .superRefine((value, context) => {
    if (value.action === "reschedule" && !value.dueOn) {
      context.addIssue({ code: "custom", message: "dueOn is required" });
    }
  });

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase chưa được cấu hình." }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || !isAllowedPracticeUser(authData.user)) {
    return Response.json({ error: "Cần đăng nhập owner." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request không phải JSON hợp lệ." }, { status: 400 });
  }
  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Schedule action không hợp lệ." }, { status: 400 });
  }

  const loaded = await loadQuestionOverrides(supabase);
  if (loaded.error) {
    return Response.json(
      { error: "Không đọc được question overrides." },
      { status: 502 },
    );
  }
  const manifest = applyQuestionOverrides(baseManifest, loaded.overrides);

  const question = manifest.questions.find(
    (item) => item.id === parsed.data.questionId && item.status !== "archived",
  );
  if (!question) {
    return Response.json({ error: "Không tìm thấy câu hỏi hiện tại." }, { status: 404 });
  }

  const { error: mutationError } = await supabase.rpc(
    "manage_question_schedule",
    {
      p_question_id: question.id,
      p_question_version: question.version,
      p_source_hash: question.sourceHash,
      p_action: parsed.data.action,
      p_due_on: parsed.data.dueOn ?? null,
    },
  );
  if (mutationError) {
    return Response.json(
      { error: mutationError.message || "Không cập nhật được lịch học." },
      { status: 502 },
    );
  }

  const [stateResult, reviewsResult] = await Promise.all([
    supabase
      .from("user_question_states")
      .select(
        "question_id, question_version, source_hash, learning_state, due_on, interval_days, review_count, lapse_count, last_rating, last_reviewed_on, is_suspended, is_leech, content_changed, history_reset_on",
      )
      .eq("question_id", question.id)
      .single(),
    supabase
      .from("practice_reviews")
      .select(
        "question_id, reviewed_on, rating, next_due_on, question_version, source_hash, learning_state_after, interval_days_after, lapse_count_after",
      )
      .eq("question_id", question.id)
      .order("reviewed_on", { ascending: false }),
  ]);
  if (stateResult.error || reviewsResult.error) {
    return Response.json({ error: "Đã cập nhật nhưng chưa đọc lại được state." }, { status: 502 });
  }

  return Response.json({
    learning: rowsToLearningStates([
      stateResult.data as QuestionLearningStateRow,
    ])[0],
    reviewHistory: rowsToProgress(
      (reviewsResult.data ?? []) as PracticeReviewRow[],
    ).reviews,
  });
}
