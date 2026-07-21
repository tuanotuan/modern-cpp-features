import { z } from "zod";

import {
  coachFeedbackSchema,
  coachFollowUpResponseSchema,
} from "../ai/contracts";

const followUpChatMessageSchema = z.object({
  role: z.enum(["user", "assistant"]),
  content: z.string().max(2000),
  sourceSectionIds: z.array(z.string().max(120)).max(4).optional(),
  checkQuestion: z.string().max(400).optional(),
  model: z.string().max(160).optional(),
});

const questionStudySessionSchema = z.object({
  questionVersion: z.number().int().positive(),
  sourceHash: z.string().min(1).max(200),
  answer: z.string().max(6000).optional(),
  revealed: z.boolean().optional(),
  hint: z.boolean().optional(),
  sourceVisible: z.boolean().optional(),
  coachFeedback: coachFeedbackSchema.optional(),
  coachModel: z.string().max(120).optional(),
  coachAnswer: z.string().max(6000).optional(),
  followUpInput: z.string().max(2000).optional(),
  followUpChat: z.array(followUpChatMessageSchema).max(8).optional(),
  deepDiveOpen: z.boolean().optional(),
  deepDiveAnswer: z.string().max(6000).optional(),
  deepDiveFeedback: coachFollowUpResponseSchema.optional(),
  deepDiveModel: z.string().max(160).optional(),
});

const studySessionSchema = z.object({
  version: z.literal(1),
  activeQuestionId: z.string().optional(),
  questions: z.record(z.string(), questionStudySessionSchema),
});

export type QuestionStudySession = z.infer<typeof questionStudySessionSchema>;
export type StudySession = z.infer<typeof studySessionSchema>;
export type StudySessionQuestionIdentity = {
  id: string;
  version: number;
  sourceHash: string;
};

export function parseStudySession(
  raw: string | null,
  identities: StudySessionQuestionIdentity[],
): StudySession {
  if (!raw) return emptyStudySession();

  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch {
    return emptyStudySession();
  }

  const parsed = studySessionSchema.safeParse(value);
  if (!parsed.success) return emptyStudySession();

  const identityById = new Map(identities.map((item) => [item.id, item]));
  const questions = Object.fromEntries(
    Object.entries(parsed.data.questions).filter(([questionId, session]) => {
      const identity = identityById.get(questionId);
      return (
        identity?.version === session.questionVersion &&
        identity.sourceHash === session.sourceHash
      );
    }),
  );

  const activeQuestionId = parsed.data.activeQuestionId;
  return {
    version: 1,
    ...(activeQuestionId && identityById.has(activeQuestionId)
      ? { activeQuestionId }
      : {}),
    questions,
  };
}

export function serializeStudySession(
  questions: Record<string, QuestionStudySession>,
  activeQuestionId?: string,
): string {
  return JSON.stringify(
    studySessionSchema.parse({ version: 1, activeQuestionId, questions }),
  );
}

function emptyStudySession(): StudySession {
  return { version: 1, questions: {} };
}
