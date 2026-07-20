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

const verdictScoreBands: Record<
  CoachFeedback["verdict"],
  { minimum: number; maximum: number }
> = {
  needs_work: { minimum: 0, maximum: 39 },
  partial: { minimum: 40, maximum: 64 },
  solid: { minimum: 65, maximum: 84 },
  strong: { minimum: 85, maximum: 100 },
};

export function normalizeCoachFeedback(
  rawFeedback: CoachFeedback,
): CoachFeedback {
  const parsed = coachFeedbackSchema.parse(rawFeedback);
  const band = verdictScoreBands[parsed.verdict];
  const coverageRatio =
    parsed.coverage.reduce(
      (sum, item) =>
        sum + (item.status === "met" ? 1 : item.status === "partial" ? 0.5 : 0),
      0,
    ) / parsed.coverage.length;

  let score = parsed.score;
  const tenPointScore = score * 10;
  if (
    score <= 10 &&
    tenPointScore >= band.minimum &&
    tenPointScore <= band.maximum
  ) {
    score = tenPointScore;
  }

  const coverageFloor =
    coverageRatio === 1 ? 75 : coverageRatio >= 0.75 ? 65 : coverageRatio >= 0.5 ? 40 : 0;
  score = Math.max(score, coverageFloor);

  const verdict: CoachFeedback["verdict"] =
    score >= 85
      ? "strong"
      : score >= 65
        ? "solid"
        : score >= 40
          ? "partial"
          : "needs_work";

  return { ...parsed, score, verdict };
}

export const coachFollowUpMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().trim().min(1).max(2000),
});

export const coachFollowUpRequestSchema = z
  .object({
    questionId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(100),
    candidateAnswer: z.string().trim().min(10).max(6000),
    feedback: coachFeedbackSchema,
    messages: z.array(coachFollowUpMessageSchema).min(1).max(8),
  })
  .superRefine(({ messages }, context) => {
    if (messages.at(-1)?.role !== "user") {
      context.addIssue({
        code: "custom",
        path: ["messages"],
        message: "The last follow-up message must be from the user.",
      });
    }

    messages.forEach((message, index) => {
      const expectedRole = index % 2 === 0 ? "user" : "assistant";
      if (message.role !== expectedRole) {
        context.addIssue({
          code: "custom",
          path: ["messages", index, "role"],
          message: `Expected ${expectedRole} at message ${index}.`,
        });
      }
    });
  });

export const coachFollowUpResponseSchema = z.object({
  answer: z.string().trim().min(1).max(1800),
  sourceSectionIds: z.array(z.string().trim().min(1).max(120)).max(4),
  checkQuestion: z.string().trim().min(1).max(400),
});

export type CoachFollowUpMessage = z.infer<typeof coachFollowUpMessageSchema>;
export type CoachFollowUpRequest = z.infer<typeof coachFollowUpRequestSchema>;
export type CoachFollowUpResponse = z.infer<typeof coachFollowUpResponseSchema>;

export const coachFollowUpResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    answer: { type: "string" },
    sourceSectionIds: {
      type: "array",
      items: { type: "string" },
      maxItems: 4,
    },
    checkQuestion: { type: "string" },
  },
  required: ["answer", "sourceSectionIds", "checkQuestion"],
} as const;

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
