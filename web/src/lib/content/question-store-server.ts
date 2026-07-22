import "server-only";

import { createHash } from "node:crypto";

import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

import manifestJson from "../../generated/content-manifest.json";
import { isSupabaseConfigured } from "../supabase/config";
import { createSupabaseServerClient } from "../supabase/server";

import { questionRevisionChecksum } from "./backfill";
import { applyQuestionOverrides, type QuestionOverride } from "./question-overrides";
import { getQuestionStoreMode } from "./question-store-config";
import {
  contentManifestSchema,
  cppStandardSchema,
  questionDifficultySchema,
  questionResponseModeSchema,
  questionSkillSchema,
  questionTaxonomySchema,
  type ContentManifest,
} from "./schema";

const PAGE_SIZE = 500;
const repoManifest = contentManifestSchema.parse(manifestJson);

const lessonRowSchema = z.object({
  id: z.string(),
  lifecycle_status: z.enum(["active", "archived"]),
  source_hash: z.string(),
  source_commit_sha: z.string().nullable(),
  source_path: z.string(),
  standard: cppStandardSchema,
  lesson_order: z.coerce.number().int().positive(),
  title: z.string(),
  tags: z.array(z.string()),
  prerequisites: z.array(z.string()),
  code: z.string().nullable(),
  sections: z.array(
    z.object({
      id: z.string(),
      heading: z.string(),
      bodyMarkdown: z.string(),
      bodyText: z.string(),
    }),
  ),
  checklist_items: z.array(z.string()),
  manifest_order: z.coerce.number().int().positive().nullable(),
});

const questionRowSchema = z.object({
  id: z.string(),
  lesson_id: z.string(),
  version: z.coerce.number().int().positive(),
  type: questionSkillSchema,
  response_mode: questionResponseModeSchema,
  difficulty: questionDifficultySchema,
  estimated_minutes: z.coerce.number().int(),
  prompt: z.string(),
  code: z.string().nullable(),
  hint: z.string(),
  answer: z.object({ short: z.string(), detailed: z.string() }),
  rubric: z.object({
    required: z.array(z.string()),
    bonus: z.array(z.string()),
    misconceptions: z.array(z.string()),
  }),
  sources: z.array(z.object({ sectionId: z.string() })),
  taxonomy: questionTaxonomySchema,
  source_hash: z.string(),
  status: z.enum(["draft", "verified", "needs_review", "archived"]),
  manifest_order: z.coerce.number().int().positive().nullable(),
});

const storeStateSchema = z.object({
  source_revision: z.string().regex(/^[a-f0-9]{64}$/),
});

export type LessonRow = z.infer<typeof lessonRowSchema>;
export type QuestionRow = z.infer<typeof questionRowSchema>;

export type ContentParityReport = {
  ok: boolean;
  readyForCutover: boolean;
  repo: { lessons: number; questions: number };
  db: { lessons: number; questions: number };
  missingLessonIds: string[];
  extraLessonIds: string[];
  mismatchedLessonIds: string[];
  missingQuestionIds: string[];
  extraQuestionIds: string[];
  mismatchedQuestionIds: string[];
  sourceRevisionMatches: boolean;
};

export function getRepoContentManifest(
  overrides: QuestionOverride[] = [],
): ContentManifest {
  return applyQuestionOverrides(repoManifest, overrides);
}

export async function loadQuestionStoreManifest({
  supabase,
  overrides = [],
}: {
  supabase?: SupabaseClient;
  overrides?: QuestionOverride[];
} = {}): Promise<ContentManifest> {
  const mode = getQuestionStoreMode();
  const repository = getRepoContentManifest();
  if (mode === "repo") return applyQuestionOverrides(repository, overrides);

  if (!isSupabaseConfigured() && !supabase) {
    if (mode === "shadow") return applyQuestionOverrides(repository, overrides);
    throw new ContentQuestionStoreError("Supabase is not configured for DB mode");
  }

  const client = supabase ?? (await createSupabaseServerClient());
  try {
    const database = await loadSupabaseContentManifest(client);
    if (mode === "shadow") {
      const parity = compareContentManifests(repository, database);
      if (!parity.ok) console.warn("Content question-bank shadow mismatch", parity);
      return applyQuestionOverrides(repository, overrides);
    }
    return applyQuestionOverrides(database, overrides);
  } catch (error) {
    if (mode === "shadow") {
      console.warn("Content question-bank shadow read failed", {
        name: error instanceof Error ? error.name : "UnknownError",
      });
      return applyQuestionOverrides(repository, overrides);
    }
    throw error;
  }
}

export async function loadSupabaseContentManifest(
  supabase: SupabaseClient,
): Promise<ContentManifest> {
  const [lessonRows, questionRows, stateResult] = await Promise.all([
    readAllPages<unknown>(supabase, "content_current_lessons", [
      "id",
      "lifecycle_status",
      "source_hash",
      "source_commit_sha",
      "source_path",
      "standard",
      "lesson_order",
      "title",
      "tags",
      "prerequisites",
      "code",
      "sections",
      "checklist_items",
      "manifest_order",
    ].join(", ")),
    readAllPages<unknown>(supabase, "content_current_questions", [
      "id",
      "lesson_id",
      "version",
      "type",
      "response_mode",
      "difficulty",
      "estimated_minutes",
      "prompt",
      "code",
      "hint",
      "answer",
      "rubric",
      "sources",
      "taxonomy",
      "source_hash",
      "status",
      "manifest_order",
    ].join(", ")),
    supabase
      .from("content_store_state")
      .select("source_revision")
      .eq("singleton", true)
      .maybeSingle(),
  ]);

  if (stateResult.error) {
    throw new ContentQuestionStoreError(
      `content_store_state: ${stateResult.error.code}`,
    );
  }
  if (!stateResult.data) {
    throw new ContentQuestionStoreError("content_store_state: missing snapshot");
  }
  const state = storeStateSchema.parse(stateResult.data);

  return rowsToContentManifest(
    z.array(lessonRowSchema).parse(lessonRows),
    z.array(questionRowSchema).parse(questionRows),
    state.source_revision,
  );
}

export function rowsToContentManifest(
  lessonRows: LessonRow[],
  questionRows: QuestionRow[],
  sourceRevision: string,
): ContentManifest {
  const activeLessons = lessonRows
    .filter(
      (row): row is LessonRow & { manifest_order: number } =>
        row.lifecycle_status === "active" && row.manifest_order !== null,
    )
    .sort(
      (left, right) =>
        left.manifest_order - right.manifest_order ||
        left.id.localeCompare(right.id),
    )
    .map((row) => ({
      id: row.id,
      sourcePath: row.source_path,
      standard: row.standard,
      order: row.lesson_order,
      tags: row.tags,
      prerequisites: row.prerequisites,
      title: row.title,
      knowledgePath: `${row.source_path}/knowledge.md`,
      codePath: row.code ? `${row.source_path}/main.cpp` : null,
      sourceHash: row.source_hash,
      sections: row.sections,
      checklistItems: row.checklist_items,
      code: row.code,
    }));
  const activeLessonIds = new Set(activeLessons.map((lesson) => lesson.id));
  const questions = questionRows
    .filter(
      (row): row is QuestionRow & { manifest_order: number } =>
        row.manifest_order !== null && activeLessonIds.has(row.lesson_id),
    )
    .sort(
      (left, right) =>
        left.manifest_order - right.manifest_order ||
        left.id.localeCompare(right.id),
    )
    .map((row) => ({
      id: row.id,
      lessonId: row.lesson_id,
      type: row.type,
      responseMode: row.response_mode,
      difficulty: row.difficulty,
      estimatedMinutes: row.estimated_minutes,
      prompt: row.prompt,
      code: row.code ?? undefined,
      hint: row.hint,
      answer: row.answer,
      rubric: row.rubric,
      sources: row.sources,
      sourceHash: row.source_hash,
      status: row.status,
      version: row.version,
      taxonomy: row.taxonomy,
    }));

  return contentManifestSchema.parse({
    schemaVersion: 1,
    sourceRevision,
    lessons: activeLessons,
    questions,
  });
}

export function compareContentManifests(
  repository: ContentManifest,
  database: ContentManifest,
): ContentParityReport {
  const repoLessons = new Map(repository.lessons.map((lesson) => [lesson.id, lesson]));
  const dbLessons = new Map(database.lessons.map((lesson) => [lesson.id, lesson]));
  const repoQuestions = new Map(repository.questions.map((question) => [question.id, question]));
  const dbQuestions = new Map(database.questions.map((question) => [question.id, question]));
  const missingLessonIds = difference(repoLessons, dbLessons);
  const extraLessonIds = difference(dbLessons, repoLessons);
  const missingQuestionIds = difference(repoQuestions, dbQuestions);
  const extraQuestionIds = difference(dbQuestions, repoQuestions);
  const mismatchedLessonIds = [...repoLessons.keys()].filter((id) => {
    const dbLesson = dbLessons.get(id);
    return dbLesson ? lessonChecksum(repoLessons.get(id)!) !== lessonChecksum(dbLesson) : false;
  });
  const mismatchedQuestionIds = [...repoQuestions.keys()].filter((id) => {
    const dbQuestion = dbQuestions.get(id);
    const repoQuestion = repoQuestions.get(id)!;
    return dbQuestion
      ? repoQuestion.version !== dbQuestion.version ||
          repoQuestion.status !== dbQuestion.status ||
          questionRevisionChecksum(repoQuestion) !== questionRevisionChecksum(dbQuestion)
      : false;
  });
  const ok = [
    missingLessonIds,
    extraLessonIds,
    mismatchedLessonIds,
    missingQuestionIds,
    extraQuestionIds,
    mismatchedQuestionIds,
  ].every((items) => items.length === 0);
  const sourceRevisionMatches =
    repository.sourceRevision === database.sourceRevision;

  return {
    ok,
    readyForCutover: ok && sourceRevisionMatches,
    repo: { lessons: repository.lessons.length, questions: repository.questions.length },
    db: { lessons: database.lessons.length, questions: database.questions.length },
    missingLessonIds,
    extraLessonIds,
    mismatchedLessonIds,
    missingQuestionIds,
    extraQuestionIds,
    mismatchedQuestionIds,
    sourceRevisionMatches,
  };
}

async function readAllPages<T>(
  supabase: SupabaseClient,
  relation: string,
  columns: string,
): Promise<T[]> {
  const rows: T[] = [];
  for (let from = 0; ; from += PAGE_SIZE) {
    const { data, error } = await supabase
      .from(relation)
      .select(columns)
      .range(from, from + PAGE_SIZE - 1);
    if (error) throw new ContentQuestionStoreError(`${relation}: ${error.code}`);
    const page = (data ?? []) as T[];
    rows.push(...page);
    if (page.length < PAGE_SIZE) return rows;
  }
}

function difference<T>(left: Map<string, T>, right: Map<string, T>): string[] {
  return [...left.keys()].filter((id) => !right.has(id)).sort();
}

function lessonChecksum(lesson: ContentManifest["lessons"][number]): string {
  return sha256(
    JSON.stringify({
      sourcePath: lesson.sourcePath,
      standard: lesson.standard,
      order: lesson.order,
      tags: lesson.tags,
      prerequisites: lesson.prerequisites,
      title: lesson.title,
      knowledgePath: lesson.knowledgePath,
      codePath: lesson.codePath,
      sourceHash: lesson.sourceHash,
      sections: lesson.sections,
      checklistItems: lesson.checklistItems,
      code: lesson.code,
    }),
  );
}

function sha256(...values: string[]): string {
  const hash = createHash("sha256");
  values.forEach((value) => hash.update(value));
  return hash.digest("hex");
}

export class ContentQuestionStoreError extends Error {}
