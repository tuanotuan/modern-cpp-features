import type { User } from "@supabase/supabase-js";

export function isAllowedPracticeUser(user: User): boolean {
  const login = user.user_metadata.user_name;
  if (typeof login !== "string") return false;

  const allowedLogins = (process.env.ALLOWED_GITHUB_LOGIN || "tuanotuan")
    .split(",")
    .map((item) => item.trim().toLowerCase())
    .filter(Boolean);

  return allowedLogins.includes(login.toLowerCase());
}
