import { z } from "zod";

import type { Question } from "@/lib/content/schema";

export const questionApprovalSchema = z.object({
  questionId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
  questionVersion: z.number().int().positive(),
  sourceHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const approveQuestionsSchema = z.object({
  questions: z.array(questionApprovalSchema).min(1).max(200),
});

export type QuestionApproval = z.infer<typeof questionApprovalSchema>;

export type QuestionApprovalRow = {
  question_id: string;
  question_version: number;
  source_hash: string;
};

export function rowsToApprovals(rows: QuestionApprovalRow[]): QuestionApproval[] {
  return rows.map((row) => ({
    questionId: row.question_id,
    questionVersion: row.question_version,
    sourceHash: row.source_hash,
  }));
}

export function isQuestionApproved(
  question: Question,
  approvals: QuestionApproval[],
) {
  return approvals.some(
    (approval) =>
      approval.questionId === question.id &&
      approval.questionVersion === question.version &&
      approval.sourceHash === question.sourceHash,
  );
}

export function activeQuestionIds(
  questions: Question[],
  approvals: QuestionApproval[],
) {
  return new Set(
    questions
      .filter(
        (question) =>
          question.status === "verified" ||
          (new Set(["draft", "needs_review"]).has(question.status) &&
            isQuestionApproved(question, approvals)),
      )
      .map((question) => question.id),
  );
}
