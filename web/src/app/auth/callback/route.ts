import { NextResponse } from "next/server";

import { isAllowedPracticeUser } from "@/lib/supabase/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export async function GET(request: Request) {
  const { origin, searchParams } = new URL(request.url);
  const code = searchParams.get("code");
  const requestedNext = searchParams.get("next") ?? "/";
  const next = requestedNext.startsWith("/") ? requestedNext : "/";

  if (!code || !isSupabaseConfigured()) {
    return NextResponse.redirect(`${origin}/?auth=callback-error`);
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.exchangeCodeForSession(code);
  if (error) return NextResponse.redirect(`${origin}/?auth=callback-error`);

  const { data: authData } = await supabase.auth.getUser();
  if (!authData.user || !isAllowedPracticeUser(authData.user)) {
    await supabase.auth.signOut();
    return NextResponse.redirect(`${origin}/?auth=unauthorized`);
  }

  const forwardedHost = request.headers.get("x-forwarded-host");
  if (process.env.NODE_ENV !== "development" && forwardedHost) {
    return NextResponse.redirect(`https://${forwardedHost}${next}`);
  }
  return NextResponse.redirect(`${origin}${next}`);
}
