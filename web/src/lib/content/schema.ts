import { z } from "zod";

const idSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase kebab-case ID");

export const cppStandardSchema = z.enum(["cpp98", "cpp11", "cpp20"]);

export const lessonRegistryEntrySchema = z.object({
  id: idSchema,
  sourcePath: z.string().trim().min(1),
  standard: cppStandardSchema,
  order: z.number().int().positive(),
  tags: z.array(idSchema).min(1),
  prerequisites: z.array(idSchema).optional().default([]),
});

export const lessonRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  lessons: z.array(lessonRegistryEntrySchema).min(1),
});

export const questionSchema = z.object({
  id: idSchema,
  lessonId: idSchema,
  type: z.enum(["recall", "code_reasoning", "pitfall", "scenario"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedMinutes: z.number().int().min(1).max(15),
  prompt: z.string().trim().min(10),
  code: z.string().trim().min(1).optional(),
  hint: z.string().trim().min(5),
  answer: z.object({
    short: z.string().trim().min(10),
    detailed: z.string().trim().min(20),
  }),
  rubric: z.object({
    required: z.array(z.string().trim().min(3)).min(1),
    bonus: z.array(z.string().trim().min(3)).optional().default([]),
    misconceptions: z.array(z.string().trim().min(3)).optional().default([]),
  }),
  sources: z
    .array(
      z.object({
        sectionId: idSchema,
      }),
    )
    .min(1),
  status: z.enum(["draft", "verified", "needs_review", "archived"]),
  version: z.number().int().positive(),
});

export const questionFileSchema = z.object({
  schemaVersion: z.literal(1),
  questions: z.array(questionSchema).min(1),
});

export const lessonSectionSchema = z.object({
  id: idSchema,
  heading: z.string().min(1),
  bodyMarkdown: z.string(),
  bodyText: z.string(),
});

export const generatedLessonSchema = lessonRegistryEntrySchema.extend({
  title: z.string().min(1),
  knowledgePath: z.string().min(1),
  codePath: z.string().min(1).nullable(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
  sections: z.array(lessonSectionSchema).min(1),
  checklistItems: z.array(z.string().min(1)),
  code: z.string().nullable(),
});

export const contentManifestSchema = z.object({
  schemaVersion: z.literal(1),
  sourceCommitSha: z.string().min(1),
  lessons: z.array(generatedLessonSchema),
  questions: z.array(questionSchema),
});

export type Question = z.infer<typeof questionSchema>;
export type GeneratedLesson = z.infer<typeof generatedLessonSchema>;
export type ContentManifest = z.infer<typeof contentManifestSchema>;
