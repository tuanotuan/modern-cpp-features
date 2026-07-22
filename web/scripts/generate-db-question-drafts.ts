import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import manifestJson from "../src/generated/content-manifest.json";
import {
  generateQuestionDraftBatchWithFallback,
  isProviderRateLimitError,
  QUESTION_GENERATOR_PROMPT_VERSION,
} from "../src/lib/content/drafts";
import { materializeDatabaseQuestionDrafts } from "../src/lib/content/db-generation";
import { contentManifestSchema } from "../src/lib/content/schema";

const jobSchema = z.object({
  id: z.coerce.number().int().positive(),
  lessonId: z.string(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  requestedCount: z.number().int().min(1).max(5),
  attemptCount: z.number().int().positive(),
  leaseToken: z.string().uuid(),
  leaseExpiresAt: z.string(),
});
const completionSchema = z.object({
  ok: z.literal(true),
  stale: z.boolean(),
  questionIds: z.array(z.string()),
});
const failureSchema = z.object({
  ok: z.literal(true),
  status: z.enum(["deferred", "failed", "dead_letter"]),
  nextAttemptAt: z.string(),
});

async function main() {
  const webRoot = path.resolve(import.meta.dirname, "..");
  loadEnvConfig(webRoot);
  const supabase = createClient(
    requiredEnvironment(
      "SUPABASE_URL",
      process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
    ),
    requiredEnvironment(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
    { auth: { autoRefreshToken: false, persistSession: false } },
  );
  const manifest = contentManifestSchema.parse(manifestJson);
  const maxJobs = positiveInteger(
    process.env.CONTENT_GENERATION_MAX_JOBS,
    8,
  );
  const completedIds: string[] = [];

  for (let processed = 0; processed < maxJobs; processed += 1) {
    const { data: claimData, error: claimError } = await supabase.rpc(
      "claim_content_generation_job",
      { p_lease_seconds: 600 },
    );
    if (claimError) {
      throw new Error(
        `Generation claim failed: ${claimError.code} ${claimError.message}`,
      );
    }
    if (claimData === null) break;
    const job = jobSchema.parse(claimData);
    const lesson = manifest.lessons.find(
      (item) => item.id === job.lessonId && item.sourceHash === job.sourceHash,
    );

    try {
      if (!lesson) {
        throw new NonRetryableGenerationError(
          "stale_manifest",
          `Current manifest does not contain ${job.lessonId}@${job.sourceHash}`,
        );
      }
      const batch = await generateQuestionDraftBatchWithFallback({
        lesson,
        count: job.requestedCount,
      });
      const drafts = materializeDatabaseQuestionDrafts(
        lesson,
        batch.questions,
      );
      const { data: completionData, error: completionError } = await supabase.rpc(
        "complete_content_generation_job",
        {
          p_job_id: job.id,
          p_lease_token: job.leaseToken,
          p_drafts: drafts,
          p_provider: batch.provider,
          p_model: batch.model,
          p_prompt_version: QUESTION_GENERATOR_PROMPT_VERSION,
        },
      );
      if (completionError) {
        throw new NonRetryableGenerationError(
          "storage_failure",
          `Generation completion failed: ${completionError.code} ${completionError.message}`,
        );
      }
      const completion = completionSchema.parse(completionData);
      completedIds.push(...completion.questionIds);
      console.log(
        completion.stale
          ? `Skipped stale generation job ${job.id}.`
          : `Generated ${completion.questionIds.join(", ")} with ${batch.provider}/${batch.model}.`,
      );
    } catch (error) {
      const retryable = isRetryableGenerationError(error);
      const failure = await failJob(supabase, job, error, retryable);
      console.warn(
        `Generation job ${job.id} ${failure.status}: ${safeErrorMessage(error)}`,
      );
      if (!retryable) throw error;
      break;
    }
  }

  console.log(
    completedIds.length
      ? `DB-native generation complete: ${completedIds.length} draft(s).`
      : "DB-native generation complete: no ready jobs.",
  );
}

async function failJob(
  supabase: SupabaseClient,
  job: z.infer<typeof jobSchema>,
  error: unknown,
  retryable: boolean,
) {
  const { data, error: rpcError } = await supabase.rpc(
    "fail_content_generation_job",
    {
      p_job_id: job.id,
      p_lease_token: job.leaseToken,
      p_error: {
        code: errorCode(error),
        message: safeErrorMessage(error),
        at: new Date().toISOString(),
      },
      p_retryable: retryable,
    },
  );
  if (rpcError) {
    throw new Error(`Could not record generation failure: ${rpcError.message}`);
  }
  return failureSchema.parse(data);
}

function isRetryableGenerationError(error: unknown) {
  if (error instanceof NonRetryableGenerationError) return false;
  if (isProviderRateLimitError(error)) return true;
  if (typeof error === "object" && error !== null) {
    const status = "status" in error ? error.status : undefined;
    if (typeof status === "number" && status >= 500) return true;
    const code = "code" in error ? error.code : undefined;
    if (typeof code === "string" && ["ETIMEDOUT", "ECONNRESET", "ENOTFOUND"].includes(code)) {
      return true;
    }
  }
  return false;
}

function errorCode(error: unknown) {
  if (isProviderRateLimitError(error)) return "provider_rate_limit";
  if (error instanceof z.ZodError) return "invalid_provider_output";
  if (error instanceof SyntaxError) return "invalid_provider_json";
  if (error instanceof NonRetryableGenerationError) return error.code;
  return "generation_failed";
}

function safeErrorMessage(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message.replace(/sk-[A-Za-z0-9_-]+/g, "[redacted]").slice(0, 1000);
}

function requiredEnvironment(name: string, value: string | undefined) {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required`);
  return normalized;
}

function positiveInteger(value: string | undefined, fallback: number) {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 50) {
    throw new Error("CONTENT_GENERATION_MAX_JOBS must be between 1 and 50");
  }
  return parsed;
}

class NonRetryableGenerationError extends Error {
  constructor(
    readonly code: "stale_manifest" | "storage_failure",
    message: string,
  ) {
    super(message);
  }
}

void main().catch((error: unknown) => {
  console.error(safeErrorMessage(error));
  process.exitCode = 1;
});
