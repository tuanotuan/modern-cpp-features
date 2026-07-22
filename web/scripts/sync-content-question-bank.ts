import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { createClient } from "@supabase/supabase-js";
import fg from "fast-glob";
import { parse as parseYaml } from "yaml";
import { z } from "zod";

import manifestJson from "../src/generated/content-manifest.json";
import {
  buildContentBackfillPayload,
  type RawQuestionMetadata,
} from "../src/lib/content/backfill";
import { findRepoRoot } from "../src/lib/content/loader";
import {
  contentManifestSchema,
  questionFileSchema,
} from "../src/lib/content/schema";

const syncResultSchema = z.object({
  ok: z.literal(true),
  idempotent: z.boolean(),
  lessons: z.number().int().nonnegative(),
  questions: z.number().int().nonnegative(),
  sourceCommitSha: z.string(),
  sourceRevision: z.string(),
  payloadChecksum: z.string(),
});
const enqueueResultSchema = z.object({
  ok: z.literal(true),
  enqueued: z.number().int().nonnegative(),
});

const GENERATOR_VERSION = "trading-grounded-v1";

async function main() {
  const webRoot = path.resolve(import.meta.dirname, "..");
  loadEnvConfig(webRoot);
  const repository = process.env.CONTENT_REPOSITORY?.trim() ||
    "tuanotuan/modern-cpp-features";
  const repoRoot = await findRepoRoot(webRoot);
  const manifest = contentManifestSchema.parse(manifestJson);
  const sourceCommitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const knowledgeMarkdownByLessonId = new Map<string, string>();
  for (const lesson of manifest.lessons) {
    knowledgeMarkdownByLessonId.set(
      lesson.id,
      await readFile(path.join(repoRoot, lesson.knowledgePath), "utf8"),
    );
  }

  const rawQuestionMetadataById = new Map<string, RawQuestionMetadata>();
  const questionFiles = await fg("content/questions/*.yaml", {
    cwd: webRoot,
    absolute: true,
  });
  for (const questionFile of questionFiles.sort()) {
    const document = questionFileSchema.parse(
      parseYaml(await readFile(questionFile, "utf8")),
    );
    const origin = path.basename(questionFile) === "pilot.yaml"
      ? "pilot"
      : "generated";
    for (const question of document.questions) {
      if (rawQuestionMetadataById.has(question.id)) {
        throw new Error(`Duplicate question ID ${question.id}`);
      }
      rawQuestionMetadataById.set(question.id, {
        origin,
        lifecycleStatus: question.status === "verified"
          ? "verified"
          : question.status === "archived"
            ? "archived"
            : "draft",
      });
    }
  }

  const payload = buildContentBackfillPayload({
    manifest,
    sourceCommitSha,
    knowledgeMarkdownByLessonId,
    rawQuestionMetadataById,
  });
  if (process.argv.includes("--check")) {
    process.stdout.write(`${JSON.stringify({
      sourceCommitSha: payload.sourceCommitSha,
      sourceRevision: payload.manifestSourceRevision,
      lessons: payload.expected.lessons,
      questions: payload.expected.questions,
      payloadChecksum: payload.expected.payloadChecksum,
    }, null, 2)}\n`);
    return;
  }

  const supabaseUrl = requiredEnvironment(
    "SUPABASE_URL",
    process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL,
  );
  const serviceRoleKey = requiredEnvironment(
    "SUPABASE_SERVICE_ROLE_KEY",
    process.env.SUPABASE_SERVICE_ROLE_KEY,
  );
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { data, error } = await supabase.rpc("sync_content_question_bank", {
    p_manifest: payload,
    p_repository: repository,
    p_github_run_id: process.env.CONTENT_GITHUB_RUN_ID?.trim() || null,
    p_delivery_id: `${repository}:${sourceCommitSha}`,
  });
  if (error) {
    throw new Error(`Supabase content sync failed: ${error.code} ${error.message}`);
  }

  const result = syncResultSchema.parse(data);
  if (
    result.lessons !== payload.expected.lessons ||
    result.questions !== payload.expected.questions ||
    result.sourceRevision !== payload.manifestSourceRevision ||
    result.payloadChecksum !== payload.expected.payloadChecksum
  ) {
    throw new Error("Supabase content sync returned a mismatched snapshot");
  }
  const { data: enqueueData, error: enqueueError } = await supabase.rpc(
    "enqueue_content_generation_jobs",
    {
      p_generator_version: GENERATOR_VERSION,
      p_provider: "openai",
      p_model: process.env.OPENAI_LUNA_MODEL || "gpt-5.6-luna",
      p_requested_count: 2,
      p_github_run_id: process.env.CONTENT_GITHUB_RUN_ID?.trim() || null,
    },
  );
  if (enqueueError) {
    throw new Error(
      `Supabase generation enqueue failed: ${enqueueError.code} ${enqueueError.message}`,
    );
  }
  const enqueue = enqueueResultSchema.parse(enqueueData);
  process.stdout.write(`${JSON.stringify({ ...result, enqueued: enqueue.enqueued }, null, 2)}\n`);
}

function requiredEnvironment(name: string, value: string | undefined): string {
  const normalized = value?.trim();
  if (!normalized) throw new Error(`${name} is required for content sync`);
  return normalized;
}

void main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
