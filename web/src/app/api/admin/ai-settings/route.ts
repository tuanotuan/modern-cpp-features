import { z } from "zod";

import { isAllowedPracticeUser } from "@/lib/supabase/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const settingsSchema = z.object({
  geminiFallbackEnabled: z.boolean(),
});

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase chưa được cấu hình." }, { status: 503 });
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || !isAllowedPracticeUser(authData.user)) {
    return Response.json({ error: "Cần đăng nhập owner để đổi AI fallback." }, { status: 401 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Request không phải JSON hợp lệ." }, { status: 400 });
  }
  const parsed = settingsSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json({ error: "Cấu hình AI không hợp lệ." }, { status: 400 });
  }
  if (
    parsed.data.geminiFallbackEnabled &&
    (!process.env.GEMINI_API_KEY ||
      process.env.GEMINI_FALLBACK_ENABLED?.toLowerCase() === "false")
  ) {
    return Response.json(
      { error: "Vercel chưa có GEMINI_API_KEY." },
      { status: 503 },
    );
  }

  const { error } = await supabase.from("ai_provider_settings").upsert(
    {
      user_id: authData.user.id,
      gemini_fallback_enabled: parsed.data.geminiFallbackEnabled,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "user_id" },
  );
  if (error) {
    return Response.json(
      { error: "Không lưu được cấu hình Gemini fallback." },
      { status: 502 },
    );
  }

  return Response.json({
    geminiFallbackEnabled: parsed.data.geminiFallbackEnabled,
  });
}
