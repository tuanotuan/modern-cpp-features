import {
  compareContentManifests,
  getRepoContentManifest,
  loadSupabaseContentManifest,
} from "@/lib/content/question-store-server";
import { isAllowedPracticeUser } from "@/lib/supabase/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

export async function GET() {
  if (!isSupabaseConfigured()) {
    return Response.json({ error: "Supabase chưa được cấu hình." }, { status: 503 });
  }
  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } = await supabase.auth.getUser();
  if (authError || !authData.user || !isAllowedPracticeUser(authData.user)) {
    return Response.json({ error: "Cần đăng nhập owner." }, { status: 401 });
  }
  try {
    const [repository, database] = await Promise.all([
      Promise.resolve(getRepoContentManifest()),
      loadSupabaseContentManifest(supabase),
    ]);
    return Response.json(compareContentManifests(repository, database), {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("Content parity check failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return Response.json(
      { error: "Không đọc được question bank shadow." },
      { status: 502 },
    );
  }
}
