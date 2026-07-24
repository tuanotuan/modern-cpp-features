import { z } from "zod";

import { mockInterviewReportSchema } from "./contracts";

export const MOCK_INTERVIEW_STORAGE_KEY =
  "recall:mock-interview:worldquant:v1";

const sessionSchema = z
  .object({
    schemaVersion: z.literal(1),
    sessionId: z.string().uuid(),
    profileId: z.literal("worldquant-tick-data-engineer"),
    profileVersion: z.literal(1),
    sourceRevision: z.string().regex(/^[a-f0-9]{40,64}$/),
    durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60)]),
    status: z.enum(["in_progress", "evaluating", "completed"]),
    startedAt: z.string().datetime(),
    deadlineAt: z.string().datetime(),
    questions: z
      .array(
        z.object({
          id: z
            .string()
            .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
            .max(120),
          origin: z.enum(["question_bank", "role_profile"]),
          version: z.number().int().positive(),
          contentRevision: z.string().trim().min(1).max(128),
        }),
      )
      .min(3)
      .max(8),
    currentIndex: z.number().int().min(0).max(7),
    answers: z.record(
      z.string(),
      z.object({
        response: z.string().max(8000),
        explanation: z.string().max(4000),
      }),
    ),
    elapsedByQuestion: z.record(
      z.string(),
      z.number().int().min(0).max(2 * 60 * 60),
    ),
    activeQuestionStartedAt: z.string().datetime(),
    report: mockInterviewReportSchema.optional(),
    reportModel: z.string().trim().max(120).optional(),
    reportProvider: z.enum(["openai", "gemini"]).optional(),
  })
  .superRefine((session, context) => {
    const questionIds = session.questions.map((question) => question.id);
    if (new Set(questionIds).size !== questionIds.length) {
      context.addIssue({
        code: "custom",
        path: ["questions"],
        message: "Mock session contains duplicate question IDs",
      });
    }
    if (session.currentIndex >= session.questions.length) {
      context.addIssue({
        code: "custom",
        path: ["currentIndex"],
        message: "Mock session current index is out of range",
      });
    }
    const knownIds = new Set(questionIds);
    for (const questionId of [
      ...Object.keys(session.answers),
      ...Object.keys(session.elapsedByQuestion),
    ]) {
      if (!knownIds.has(questionId)) {
        context.addIssue({
          code: "custom",
          path: ["answers", questionId],
          message: "Mock session contains state for an unknown question",
        });
      }
    }
    if (session.status === "completed" && !session.report) {
      context.addIssue({
        code: "custom",
        path: ["report"],
        message: "Completed mock session is missing its report",
      });
    }
  });

export type MockInterviewSession = z.infer<typeof sessionSchema>;

export function parseMockInterviewSession(raw: string | null) {
  if (!raw) return null;
  try {
    return sessionSchema.parse(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function serializeMockInterviewSession(session: MockInterviewSession) {
  return JSON.stringify(sessionSchema.parse(session));
}
