import { z } from "zod";

import {
  contentManifestSchema,
  questionDifficultySchema,
  questionResponseModeSchema,
  questionSkillSchema,
  type ContentManifest,
  type ContentQuestion,
} from "./schema";
import { buildQuestionTaxonomy } from "./taxonomy";

const rubricItemSchema = z.string().trim().min(3).max(1000);

export const editableQuestionContentSchema = z.object({
  type: questionSkillSchema,
  responseMode: questionResponseModeSchema,
  difficulty: questionDifficultySchema,
  estimatedMinutes: z.number().int().min(1).max(15),
  prompt: z.string().trim().min(10).max(3000),
  code: z.string().trim().max(10_000).nullable(),
  hint: z.string().trim().min(5).max(2000),
  answer: z.object({
    short: z.string().trim().min(10).max(3000),
    detailed: z.string().trim().min(20).max(12_000),
  }),
  rubric: z.object({
    required: z.array(rubricItemSchema).min(1).max(12),
    bonus: z.array(rubricItemSchema).max(12),
    misconceptions: z.array(rubricItemSchema).max(12),
  }),
});

export const questionMutationSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("edit"),
    questionId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
    content: editableQuestionContentSchema,
  }),
  z.object({
    action: z.enum(["archive", "restore"]),
    questionId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  }),
]);

export type EditableQuestionContent = z.infer<
  typeof editableQuestionContentSchema
>;

export type QuestionOverrideRow = {
  question_id: string;
  base_question_version: number;
  question_version: number;
  source_hash: string;
  content: unknown;
  is_edited: boolean;
  is_archived: boolean;
};

export type QuestionOverride = {
  questionId: string;
  baseQuestionVersion: number;
  questionVersion: number;
  sourceHash: string;
  content: EditableQuestionContent;
  edited: boolean;
  archived: boolean;
};

export function editableQuestionContent(
  question: ContentQuestion,
): EditableQuestionContent {
  return {
    type: question.type,
    responseMode: question.responseMode ?? "text",
    difficulty: question.difficulty,
    estimatedMinutes: question.estimatedMinutes,
    prompt: question.prompt,
    code: question.code ?? null,
    hint: question.hint,
    answer: question.answer,
    rubric: question.rubric,
  };
}

export function rowsToQuestionOverrides(
  rows: QuestionOverrideRow[],
): QuestionOverride[] {
  return rows.flatMap((row) => {
    const content = editableQuestionContentSchema.safeParse(row.content);
    if (!content.success) return [];
    return [
      {
        questionId: row.question_id,
        baseQuestionVersion: Number(row.base_question_version),
        questionVersion: Number(row.question_version),
        sourceHash: row.source_hash,
        content: content.data,
        edited: row.is_edited,
        archived: row.is_archived,
      },
    ];
  });
}

export function applyQuestionOverrides(
  manifest: ContentManifest,
  overrides: QuestionOverride[],
): ContentManifest {
  const overrideById = new Map(
    overrides.map((override) => [override.questionId, override]),
  );
  const lessonById = new Map(
    manifest.lessons.map((lesson) => [lesson.id, lesson]),
  );
  const questions = manifest.questions.map((base): ContentQuestion => {
    const override = overrideById.get(base.id);
    const lesson = lessonById.get(base.lessonId);
    if (!override || !lesson) return base;

    const content = override.edited
      ? override.content
      : editableQuestionContent(base);
    const editedSourceChanged =
      override.baseQuestionVersion !== base.version ||
      override.sourceHash !== lesson.sourceHash;
    const question: ContentQuestion = {
      ...base,
      ...content,
      code: content.code ?? undefined,
      version: override.edited
        ? Math.max(base.version, override.questionVersion)
        : base.version,
      sourceHash: override.edited ? override.sourceHash : base.sourceHash,
      status: override.archived
        ? "archived"
        : override.edited
          ? editedSourceChanged
            ? "needs_review"
            : "draft"
          : base.status,
      taxonomy: base.taxonomy,
    };
    question.taxonomy = buildQuestionTaxonomy(question, lesson);
    return question;
  });

  return contentManifestSchema.parse({ ...manifest, questions });
}

export const questionOverrideSelect =
  "question_id, base_question_version, question_version, source_hash, content, is_edited, is_archived";
