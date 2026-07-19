import { z } from "zod";

export const coachRequestSchema = z.object({
  questionId: z
    .string()
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
    .max(100),
  answer: z.string().trim().min(10).max(6000),
});

export const coachFeedbackSchema = z.object({
  score: z.number().int().min(0).max(100),
  verdict: z.enum(["needs_work", "partial", "solid", "strong"]),
  summary: z.string().trim().min(1).max(700),
  strengths: z.array(z.string().trim().min(1).max(300)).max(4),
  coverage: z
    .array(
      z.object({
        criterion: z.string().trim().min(1).max(300),
        status: z.enum(["missed", "partial", "met"]),
        feedback: z.string().trim().min(1).max(400),
      }),
    )
    .min(1)
    .max(8),
  corrections: z.array(z.string().trim().min(1).max(400)).max(4),
  explanation: z.string().trim().min(1).max(1400),
  nextStep: z.string().trim().min(1).max(400),
  followUpQuestion: z.string().trim().min(1).max(500),
  suggestedRating: z.enum(["again", "hard", "good", "easy"]),
  sourceSectionIds: z.array(z.string().trim().min(1).max(120)).max(4),
});

export type CoachFeedback = z.infer<typeof coachFeedbackSchema>;
export type CoachRequest = z.infer<typeof coachRequestSchema>;

export const coachFeedbackJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    score: {
      type: "integer",
      minimum: 0,
      maximum: 100,
      description: "Overall interview answer score from 0 to 100.",
    },
    verdict: {
      type: "string",
      enum: ["needs_work", "partial", "solid", "strong"],
    },
    summary: { type: "string" },
    strengths: { type: "array", items: { type: "string" }, maxItems: 4 },
    coverage: {
      type: "array",
      minItems: 1,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          criterion: { type: "string" },
          status: { type: "string", enum: ["missed", "partial", "met"] },
          feedback: { type: "string" },
        },
        required: ["criterion", "status", "feedback"],
      },
    },
    corrections: { type: "array", items: { type: "string" }, maxItems: 4 },
    explanation: { type: "string" },
    nextStep: { type: "string" },
    followUpQuestion: { type: "string" },
    suggestedRating: {
      type: "string",
      enum: ["again", "hard", "good", "easy"],
    },
    sourceSectionIds: {
      type: "array",
      items: { type: "string" },
      maxItems: 4,
    },
  },
  required: [
    "score",
    "verdict",
    "summary",
    "strengths",
    "coverage",
    "corrections",
    "explanation",
    "nextStep",
    "followUpQuestion",
    "suggestedRating",
    "sourceSectionIds",
  ],
} as const;
