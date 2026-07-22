import { z } from "zod";

import { isAllowedPracticeUser } from "@/lib/supabase/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const retrySchema = z.object({
  jobId: z.number().int().positive(),
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
  const parsed = retrySchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Generation job không hợp lệ." }, { status: 400 });
  }
  const { data, error } = await supabase.rpc("retry_content_generation_job", {
    p_job_id: parsed.data.jobId,
  });
  if (error) {
    return Response.json(
      { error: error.message || "Không retry được generation job." },
      { status: 409 },
    );
  }
  const result = z.object({ ok: z.literal(true), status: z.literal("pending") }).safeParse(data);
  if (!result.success) {
    return Response.json({ error: "Supabase trả kết quả retry không hợp lệ." }, { status: 502 });
  }
  return Response.json(result.data);
}
