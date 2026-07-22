import { loadQuestionOverrides } from "@/lib/content/question-overrides-server";
import { loadQuestionStoreManifest } from "@/lib/content/question-store-server";
import { approveQuestionsSchema } from "@/lib/practice/approvals";
import { isAllowedPracticeUser } from "@/lib/supabase/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Cloud approvals chưa được cấu hình." }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || !isAllowedPracticeUser(authData.user)) {
    return Response.json({ error: "Cần đăng nhập GitHub để duyệt câu hỏi." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request không phải JSON hợp lệ." }, { status: 400 });
  }

  const parsed = approveQuestionsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Approval payload không hợp lệ." }, { status: 400 });
  }

  const loaded = await loadQuestionOverrides(supabase);
  if (loaded.error) {
    return Response.json(
      { error: "Không đọc được question overrides." },
      { status: 502 },
    );
  }
  const manifest = await loadQuestionStoreManifest({
    supabase,
    overrides: loaded.overrides,
  });

  const pendingById = new Map(
    manifest.questions
      .filter((question) =>
        new Set(["draft", "needs_review"]).has(question.status),
      )
      .map((question) => [question.id, question]),
  );
  const valid = parsed.data.questions.every((approval) => {
    const question = pendingById.get(approval.questionId);
    return (
      question?.version === approval.questionVersion &&
      question.sourceHash === approval.sourceHash
    );
  });
  if (!valid) {
    return Response.json(
      { error: "Question version hoặc source hash đã thay đổi; tải lại queue." },
      { status: 409 },
    );
  }

  const rows = parsed.data.questions.map((approval) => ({
    user_id: authData.user.id,
    question_id: approval.questionId,
    question_version: approval.questionVersion,
    source_hash: approval.sourceHash,
    approved_at: new Date().toISOString(),
  }));
  const { error } = await supabase.from("question_approvals").upsert(rows, {
    onConflict: "user_id,question_id",
  });
  if (error) {
    return Response.json({ error: "Không lưu được approvals." }, { status: 502 });
  }

  return Response.json({ approved: parsed.data.questions });
}
