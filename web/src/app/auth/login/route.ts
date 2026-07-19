import { NextResponse } from "next/server";

import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function POST(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const requestedNext = searchParams.get("next") ?? "/";
  const next = requestedNext.startsWith("/") ? requestedNext : "/";
  if (!isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/?auth=not-configured`, 303);
  }

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "github",
    options: {
      redirectTo: `${origin}/auth/callback?next=${encodeURIComponent(next)}`,
    },
  });

  if (error || !data.url) {
    return NextResponse.redirect(`${origin}/?auth=login-error`, 303);
  }

  return NextResponse.redirect(data.url, 303);
}
