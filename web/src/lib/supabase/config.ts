export type SupabasePublicConfig = {
  url: string;
  publishableKey: string;
};

export function isSupabaseConfigured(): boolean {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY?.trim();
  return Boolean(url && publishableKey && /^https?:\/\//.test(url));
}

export function getSupabaseConfig(): SupabasePublicConfig {
  if (!isSupabaseConfigured()) {
    throw new SupabaseConfigurationError(
      "NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY are required",
    );
  }

  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL!.trim(),
    publishableKey: process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim(),
  };
}

export class SupabaseConfigurationError extends Error {}
