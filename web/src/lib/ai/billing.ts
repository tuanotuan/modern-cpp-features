import type { SupabaseClient } from "@supabase/supabase-js";

import { vietnamUsageDate } from "./usage";

type OpenAiCostResponse = {
  data?: Array<{
    results?: Array<{
      amount?: { value?: number | string; currency?: string };
    }>;
  }>;
};

export type OpenAiBillingCosts = {
  dailyUsdMicros: number;
  monthlyUsdMicros: number;
  syncedAt: string;
};

let cachedCosts:
  | (OpenAiBillingCosts & { projectId: string; usageDate: string; expiresAt: number })
  | null = null;

export async function syncOpenAiBilling(
  client: SupabaseClient,
): Promise<OpenAiBillingCosts | null> {
  const adminKey = process.env.OPENAI_ADMIN_KEY?.trim();
  const projectId = process.env.OPENAI_PROJECT_ID?.trim();
  if (!adminKey || !projectId) return null;

  try {
    const costs = await loadOpenAiBillingCosts(adminKey, projectId);
    const { error } = await client.rpc("reconcile_ai_costs", {
      p_daily_usd_micros: costs.dailyUsdMicros,
      p_monthly_usd_micros: costs.monthlyUsdMicros,
    });
    if (error) {
      console.error("OpenAI billing reconciliation failed", { code: error.code });
      return null;
    }
    return costs;
  } catch (error) {
    console.error("OpenAI Costs API sync failed", {
      name: error instanceof Error ? error.name : "UnknownError",
    });
    return null;
  }
}

export async function loadOpenAiBillingCosts(
  adminKey: string,
  projectId: string,
  now = new Date(),
): Promise<OpenAiBillingCosts> {
  const usageDate = vietnamUsageDate(now);
  if (
    cachedCosts?.projectId === projectId &&
    cachedCosts.usageDate === usageDate &&
    cachedCosts.expiresAt > now.getTime()
  ) {
    return cachedCosts;
  }

  const dayStart = vietnamMidnightUnix(usageDate);
  const monthStart = vietnamMidnightUnix(`${usageDate.slice(0, 7)}-01`);
  const endTime = Math.floor(now.getTime() / 1000) + 1;
  const [dailyUsdMicros, monthlyUsdMicros] = await Promise.all([
    fetchCostMicros(adminKey, projectId, dayStart, endTime, 2),
    fetchCostMicros(adminKey, projectId, monthStart, endTime, 31),
  ]);
  const costs = {
    dailyUsdMicros,
    monthlyUsdMicros,
    syncedAt: now.toISOString(),
  };
  cachedCosts = {
    ...costs,
    projectId,
    usageDate,
    expiresAt: now.getTime() + 60_000,
  };
  return costs;
}

async function fetchCostMicros(
  adminKey: string,
  projectId: string,
  startTime: number,
  endTime: number,
  limit: number,
) {
  const url = new URL("https://api.openai.com/v1/organization/costs");
  url.searchParams.set("start_time", String(startTime));
  url.searchParams.set("end_time", String(endTime));
  url.searchParams.set("bucket_width", "1d");
  url.searchParams.set("limit", String(limit));
  url.searchParams.append("project_ids", projectId);

  let totalUsd = 0;
  let page: string | null = null;
  do {
    if (page) url.searchParams.set("page", page);
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${adminKey}` },
      cache: "no-store",
      signal: AbortSignal.timeout(8_000),
    });
    if (!response.ok) {
      throw new Error(`OpenAI Costs API returned ${response.status}`);
    }
    const payload = (await response.json()) as OpenAiCostResponse & {
      has_more?: boolean;
      next_page?: string | null;
    };
    for (const bucket of payload.data ?? []) {
      for (const result of bucket.results ?? []) {
        if (result.amount?.currency && result.amount.currency !== "usd") continue;
        const amount = Number(result.amount?.value ?? 0);
        if (Number.isFinite(amount) && amount > 0) totalUsd += amount;
      }
    }
    page = payload.has_more && payload.next_page ? payload.next_page : null;
  } while (page);

  return Math.ceil(totalUsd * 1_000_000);
}

function vietnamMidnightUnix(date: string) {
  return Math.floor(Date.parse(`${date}T00:00:00+07:00`) / 1000);
}
