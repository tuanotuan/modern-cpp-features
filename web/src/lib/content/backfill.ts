import { createHash } from "node:crypto";

import { z } from "zod";

import {
  contentManifestSchema,
  type ContentManifest,
  type ContentQuestion,
} from "./schema";

const gitCommitSchema = z.string().regex(/^[a-f0-9]{40}(?:[a-f0-9]{24})?$/);

const rawQuestionMetadataSchema = z.object({
  origin: z.enum(["pilot", "generated", "legacy_import"]),
  lifecycleStatus: z.enum(["draft", "verified", "archived"]),
});

const importedLessonSchema = contentManifestSchema.shape.lessons.element.extend({
  knowledgeMarkdown: z.string(),
});

const importedQuestionSchema = z.object({
  base: contentManifestSchema.shape.questions.element,
  origin: rawQuestionMetadataSchema.shape.origin,
  lifecycleStatus: rawQuestionMetadataSchema.shape.lifecycleStatus,
  contentChecksum: z.string().regex(/^[a-f0-9]{64}$/),
});

export const contentBackfillPayloadSchema = z.object({
  schemaVersion: z.literal(1),
  sourceCommitSha: gitCommitSchema,
  manifestSourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  lessons: z.array(importedLessonSchema),
  questions: z.array(importedQuestionSchema),
  expected: z.object({
    lessons: z.number().int().nonnegative(),
    questions: z.number().int().nonnegative(),
    payloadChecksum: z.string().regex(/^[a-f0-9]{64}$/),
  }),
});

export type RawQuestionMetadata = z.infer<typeof rawQuestionMetadataSchema>;
export type ContentBackfillPayload = z.infer<typeof contentBackfillPayloadSchema>;

type BuildContentBackfillPayloadInput = {
  manifest: ContentManifest;
  sourceCommitSha: string;
  knowledgeMarkdownByLessonId: ReadonlyMap<string, string>;
  rawQuestionMetadataById: ReadonlyMap<string, RawQuestionMetadata>;
};

export function buildContentBackfillPayload({
  manifest,
  sourceCommitSha,
  knowledgeMarkdownByLessonId,
  rawQuestionMetadataById,
}: BuildContentBackfillPayloadInput): ContentBackfillPayload {
  const parsedManifest = contentManifestSchema.parse(manifest);
  const parsedCommit = gitCommitSchema.parse(sourceCommitSha);
  const lessons = parsedManifest.lessons.map((lesson) => {
    const knowledgeMarkdown = knowledgeMarkdownByLessonId.get(lesson.id);
    if (knowledgeMarkdown === undefined) {
      throw new Error(`Missing knowledge markdown for lesson ${lesson.id}`);
    }
    return {
      ...lesson,
      knowledgeMarkdown: normalizeSourceText(knowledgeMarkdown),
    };
  });
  const questions = parsedManifest.questions.map((question) => {
    const metadata = rawQuestionMetadataById.get(question.id);
    if (!metadata) {
      throw new Error(`Missing raw metadata for question ${question.id}`);
    }
    return {
      base: question,
      ...rawQuestionMetadataSchema.parse(metadata),
      contentChecksum: questionRevisionChecksum(question),
    };
  });
  const checksumInput = {
    schemaVersion: 1,
    sourceCommitSha: parsedCommit,
    manifestSourceRevision: parsedManifest.sourceRevision,
    lessons,
    questions,
  };

  return contentBackfillPayloadSchema.parse({
    ...checksumInput,
    expected: {
      lessons: lessons.length,
      questions: questions.length,
      payloadChecksum: sha256(stableJson(checksumInput)),
    },
  });
}

export function questionRevisionChecksum(question: ContentQuestion): string {
  return sha256(
    stableJson({
      type: question.type,
      responseMode: question.responseMode ?? "text",
      difficulty: question.difficulty,
      estimatedMinutes: question.estimatedMinutes,
      prompt: question.prompt,
      code: question.code ?? null,
      hint: question.hint,
      answer: question.answer,
      rubric: question.rubric,
      sources: question.sources,
      taxonomy: question.taxonomy,
      sourceHash: question.sourceHash,
    }),
  );
}

export function renderContentBackfillSql(
  payload: ContentBackfillPayload,
  adminGithubLogin = "tuanotuan",
): string {
  const parsed = contentBackfillPayloadSchema.parse(payload);
  const delimiter = "$cpp_recall_content_bank$";
  const json = JSON.stringify(parsed);
  if (json.includes(delimiter)) {
    throw new Error("Backfill payload unexpectedly contains the SQL delimiter");
  }
  const escapedLogin = adminGithubLogin.replaceAll("'", "''");

  return [
    "select public.backfill_content_question_bank(",
    `  ${delimiter}${json}${delimiter}::jsonb,`,
    `  '${escapedLogin}'`,
    ");",
  ].join("\n");
}

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

function stableJson(value: unknown): string {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableJson).join(",")}]`;

  const record = value as Record<string, unknown>;
  return `{${Object.keys(record)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableJson(record[key])}`)
    .join(",")}}`;
}

function normalizeSourceText(value: string): string {
  return value.replace(/\r\n?/g, "\n").replace(/\n/g, "\r\n");
}
