import { z } from "zod";

const idSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use a lowercase kebab-case ID");

export const contentLanguageSchema = z.enum(["cpp", "python"]);

export const contentTrackSchema = z.enum([
  "cpp98",
  "cpp11",
  "cpp20",
  "python3",
]);

// Compatibility export while the UI still calls a language track "standard".
export const cppStandardSchema = contentTrackSchema;

export const questionSkillSchema = z.enum([
  "recall",
  "code_reasoning",
  "pitfall",
  "scenario",
]);

export const questionDifficultySchema = z.enum([
  "beginner",
  "intermediate",
  "advanced",
]);

export const questionResponseModeSchema = z.enum(["text", "code"]);

export const taxonomyTagSchema = z.string().regex(
  /^(?:deck|language|track|standard|topic|skill|difficulty|response|source)::[a-z0-9]+(?:-[a-z0-9]+)*$/,
  "Use a controlled namespace::lowercase-kebab-case taxonomy tag",
);

export const questionTaxonomySchema = z
  .object({
    deckId: z.enum(["cpp-interview", "python-interview"]),
    language: contentLanguageSchema.optional(),
    track: contentTrackSchema.optional(),
    standard: contentTrackSchema,
    topics: z.array(idSchema).min(1),
    skill: questionSkillSchema,
    difficulty: questionDifficultySchema,
    responseMode: questionResponseModeSchema,
    sourceLessonId: idSchema,
    tags: z.array(taxonomyTagSchema).min(6),
  })
  .superRefine((taxonomy, context) => {
    const expectedLanguage = languageForTrack(
      taxonomy.track ?? taxonomy.standard,
    );
    const deckLanguage = taxonomy.deckId === "python-interview"
      ? "python"
      : "cpp";
    if (
      expectedLanguage !== deckLanguage ||
      (taxonomy.language !== undefined && taxonomy.language !== deckLanguage) ||
      (deckLanguage === "python" &&
        (taxonomy.language !== "python" || taxonomy.track !== "python3"))
    ) {
      context.addIssue({
        code: "custom",
        message: `Taxonomy ${taxonomy.deckId} has inconsistent language/track`,
      });
    }
  });

const lessonRegistryEntryBaseSchema = z.object({
  id: idSchema,
  sourcePath: z.string().trim().min(1),
  order: z.number().int().positive(),
  tags: z.array(idSchema).min(1),
  prerequisites: z.array(idSchema).optional().default([]),
});

const normalizedLessonRegistryEntrySchema = lessonRegistryEntryBaseSchema.extend({
  language: contentLanguageSchema,
  track: contentTrackSchema,
  standard: contentTrackSchema,
});

export const lessonRegistryEntrySchema = z
  .union([
    lessonRegistryEntryBaseSchema.extend({
      standard: contentTrackSchema,
      language: contentLanguageSchema.optional(),
      track: contentTrackSchema.optional(),
    }),
    lessonRegistryEntryBaseSchema.extend({
      language: contentLanguageSchema,
      track: contentTrackSchema,
    }),
  ])
  .transform((entry): z.infer<typeof normalizedLessonRegistryEntrySchema> => {
    const track = "track" in entry && entry.track
      ? entry.track
      : "standard" in entry
        ? entry.standard
        : undefined;
    if (!track) throw new Error(`Lesson ${entry.id} is missing a track`);
    const language = entry.language ?? languageForTrack(track);
    if (language !== languageForTrack(track)) {
      throw new Error(`Track ${track} does not belong to ${language}`);
    }
    return normalizedLessonRegistryEntrySchema.parse({
      ...entry,
      language,
      track,
      standard: track,
    });
  });

export const lessonRegistrySchema = z.object({
  schemaVersion: z.literal(1),
  lessons: z.array(lessonRegistryEntrySchema).min(1),
});

export const questionSchema = z.object({
  id: idSchema,
  lessonId: idSchema,
  type: questionSkillSchema,
  responseMode: questionResponseModeSchema.optional(),
  difficulty: questionDifficultySchema,
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
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
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

export const generatedLessonSchema = normalizedLessonRegistryEntrySchema.extend({
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
  sourceRevision: z.string().regex(/^[a-f0-9]{64}$/),
  lessons: z.array(generatedLessonSchema),
  questions: z.array(
    questionSchema.extend({
      taxonomy: questionTaxonomySchema,
    }),
  ),
});

export type Question = z.infer<typeof questionSchema>;
export type QuestionTaxonomy = z.infer<typeof questionTaxonomySchema>;
export type GeneratedLesson = z.infer<typeof generatedLessonSchema>;
export type ContentManifest = z.infer<typeof contentManifestSchema>;
export type ContentQuestion = ContentManifest["questions"][number];
export type LessonRegistry = z.infer<typeof lessonRegistrySchema>;
export type LessonRegistryEntry = z.infer<typeof lessonRegistryEntrySchema>;

export function languageForTrack(
  track: z.infer<typeof contentTrackSchema>,
): z.infer<typeof contentLanguageSchema> {
  return track === "python3" ? "python" : "cpp";
}
