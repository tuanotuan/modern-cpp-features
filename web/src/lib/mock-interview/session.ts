import { z } from "zod";

import { mockInterviewReportSchema } from "./contracts";
import {
  matchesWorldQuantMockSet,
  mockInterviewSetIds,
  selectWorldQuantQuestions,
  worldQuantMockSetById,
  WORLDQUANT_PROFILE_ID,
  WORLDQUANT_PROFILE_VERSION,
  type MockInterviewSetId,
} from "./profile";

export const MOCK_INTERVIEW_STORAGE_KEY =
  "recall:mock-interview:worldquant:v2";

const sessionSchema = z
  .object({
    schemaVersion: z.literal(2),
    sessionId: z.string().uuid(),
    profileId: z.literal("worldquant-tick-data-engineer"),
    profileVersion: z.literal(2),
    setId: z.enum(mockInterviewSetIds),
    setVersion: z.number().int().positive(),
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
    if (
      !matchesWorldQuantMockSet({
        setId: session.setId,
        setVersion: session.setVersion,
        durationMinutes: session.durationMinutes,
        questionIds,
      })
    ) {
      context.addIssue({
        code: "custom",
        path: ["setId"],
        message: "Mock session does not match its versioned question set",
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

export function createMockInterviewSession({
  sessionId,
  setId,
  sourceRevision,
  startedAt,
}: {
  sessionId: string;
  setId: MockInterviewSetId;
  sourceRevision: string;
  startedAt: Date;
}): MockInterviewSession {
  const mockSet = worldQuantMockSetById(setId);
  if (!mockSet) throw new Error(`Unknown mock interview set: ${setId}`);
  const questions = selectWorldQuantQuestions({ setId });

  return sessionSchema.parse({
    schemaVersion: 2,
    sessionId,
    profileId: WORLDQUANT_PROFILE_ID,
    profileVersion: WORLDQUANT_PROFILE_VERSION,
    setId: mockSet.id,
    setVersion: mockSet.version,
    sourceRevision,
    durationMinutes: mockSet.durationMinutes,
    status: "in_progress",
    startedAt: startedAt.toISOString(),
    deadlineAt: new Date(
      startedAt.getTime() + mockSet.durationMinutes * 60_000,
    ).toISOString(),
    questions: questions.map((question) => ({
      id: question.id,
      origin: question.origin,
      version: question.version,
      contentRevision: question.contentRevision,
    })),
    currentIndex: 0,
    answers: {},
    elapsedByQuestion: {},
    activeQuestionStartedAt: startedAt.toISOString(),
  });
}

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
