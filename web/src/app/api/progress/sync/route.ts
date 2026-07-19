import manifestJson from "@/generated/content-manifest.json";
import { rowsToProgress, syncProgressSchema, type PracticeReviewRow } from "@/lib/practice/cloud";
import { contentManifestSchema } from "@/lib/content/schema";
import { isAllowedPracticeUser } from "@/lib/supabase/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const manifest = contentManifestSchema.parse(manifestJson);
const verifiedQuestionIds = new Set(
  manifest.questions
    .filter((question) => question.status === "verified")
    .map((question) => question.id),
);

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
  if (
    !parsed.success ||
    parsed.data.reviews.some((review) => !verifiedQuestionIds.has(review.questionId))
  ) {
    return Response.json({ error: "Progress payload không hợp lệ." }, { status: 400 });
  }

  if (parsed.data.reviews.length) {
    const rows = parsed.data.reviews.map((review) => ({
      user_id: authData.user.id,
      question_id: review.questionId,
      reviewed_on: review.reviewedOn,
      rating: review.rating,
      next_due_on: review.nextDueOn,
    }));
    const { error } = await supabase.from("practice_reviews").upsert(rows, {
      onConflict: "user_id,question_id,reviewed_on",
    });
    if (error) {
      return Response.json({ error: "Không ghi được cloud progress." }, { status: 502 });
    }
  }

  const { data: cloudRows, error: selectError } = await supabase
    .from("practice_reviews")
    .select("question_id, reviewed_on, rating, next_due_on")
    .order("reviewed_on", { ascending: false })
    .limit(1000);
  if (selectError) {
    return Response.json({ error: "Không đọc được cloud progress." }, { status: 502 });
  }

  return Response.json({
    progress: rowsToProgress((cloudRows ?? []) as PracticeReviewRow[]),
  });
}
