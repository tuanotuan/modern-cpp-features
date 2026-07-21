import manifestJson from "@/generated/content-manifest.json";
import {
  applyQuestionOverrides,
  editableQuestionContent,
  questionMutationSchema,
  rowsToQuestionOverrides,
  type QuestionOverrideRow,
} from "@/lib/content/question-overrides";
import { loadQuestionOverrides } from "@/lib/content/question-overrides-server";
import { contentManifestSchema } from "@/lib/content/schema";
import { isQuestionApproved } from "@/lib/practice/approvals";
import { isAllowedPracticeUser } from "@/lib/supabase/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const baseManifest = contentManifestSchema.parse(manifestJson);

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
  const parsed = questionMutationSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: "Nội dung câu hỏi không hợp lệ.", issues: parsed.error.flatten() },
      { status: 400 },
    );
  }

  const baseQuestion = baseManifest.questions.find(
    (question) => question.id === parsed.data.questionId,
  );
  if (!baseQuestion) {
    return Response.json({ error: "Không tìm thấy câu hỏi gốc." }, { status: 404 });
  }
  if (baseQuestion.status === "archived") {
    return Response.json(
      { error: "Câu hỏi đã archive từ repository nên không thể sửa hoặc khôi phục trong Admin." },
      { status: 409 },
    );
  }
  const lesson = baseManifest.lessons.find(
    (item) => item.id === baseQuestion.lessonId,
  );
  if (!lesson) {
    return Response.json({ error: "Không tìm thấy lesson nguồn." }, { status: 500 });
  }

  const loaded = await loadQuestionOverrides(supabase);
  if (loaded.error) {
    return Response.json({ error: "Không đọc được question overrides." }, { status: 502 });
  }
  const currentManifest = applyQuestionOverrides(baseManifest, loaded.overrides);
  const currentQuestion = currentManifest.questions.find(
    (question) => question.id === baseQuestion.id,
  )!;
  const existing = loaded.overrides.find(
    (override) => override.questionId === baseQuestion.id,
  );

  let row: QuestionOverrideRow;
  if (parsed.data.action === "edit") {
    row = {
      question_id: baseQuestion.id,
      base_question_version: baseQuestion.version,
      question_version:
        Math.max(baseQuestion.version, currentQuestion.version) + 1,
      source_hash: lesson.sourceHash,
      content: parsed.data.content,
      is_edited: true,
      is_archived: false,
    };
  } else if (parsed.data.action === "archive") {
    row = {
      question_id: baseQuestion.id,
      base_question_version: baseQuestion.version,
      question_version: currentQuestion.version,
      source_hash: currentQuestion.sourceHash,
      content: existing?.content ?? editableQuestionContent(currentQuestion),
      is_edited: existing?.edited ?? false,
      is_archived: true,
    };
  } else {
    if (!existing?.archived) {
      return Response.json({ error: "Câu hỏi này chưa được archive." }, { status: 409 });
    }
    row = {
      question_id: baseQuestion.id,
      base_question_version: baseQuestion.version,
      question_version: existing.questionVersion,
      source_hash: existing.sourceHash,
      content: existing.content,
      is_edited: existing.edited,
      is_archived: false,
    };
  }

  const { error: saveError } = await supabase.from("question_overrides").upsert(
    { ...row, user_id: authData.user.id },
    { onConflict: "user_id,question_id" },
  );
  if (saveError) {
    return Response.json(
      { error: saveError.message || "Không lưu được thay đổi câu hỏi." },
      { status: 502 },
    );
  }

  if (parsed.data.action === "edit") {
    await supabase
      .from("question_approvals")
      .delete()
      .eq("question_id", baseQuestion.id);
  }

  const override = rowsToQuestionOverrides([row])[0];
  if (!override) {
    return Response.json({ error: "Override vừa lưu không hợp lệ." }, { status: 500 });
  }
  const question = applyQuestionOverrides(baseManifest, [override]).questions.find(
    (item) => item.id === baseQuestion.id,
  )!;
  const { data: approvalRow } = await supabase
    .from("question_approvals")
    .select("question_id, question_version, source_hash")
    .eq("question_id", question.id)
    .maybeSingle();
  const approved =
    question.status === "verified" ||
    (approvalRow
      ? isQuestionApproved(question, [
          {
            questionId: approvalRow.question_id,
            questionVersion: approvalRow.question_version,
            sourceHash: approvalRow.source_hash,
          },
        ])
      : false);

  return Response.json({ question, approved });
}
