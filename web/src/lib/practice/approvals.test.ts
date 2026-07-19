import { describe, expect, it } from "vitest";

import type { Question } from "@/lib/content/schema";

import { activeQuestionIds, isQuestionApproved, rowsToApprovals } from "./approvals";

const pendingQuestion = {
  id: "cpp11-auto-001",
  lessonId: "cpp11-auto",
  type: "recall",
  difficulty: "beginner",
  estimatedMinutes: 2,
  prompt: "Explain how auto deduction works.",
  hint: "Think about references.",
  answer: { short: "A short valid answer.", detailed: "A detailed valid answer here." },
  rubric: { required: ["Explain deduction"], bonus: [], misconceptions: [] },
  sources: [{ sectionId: "auto-deduction" }],
  sourceHash: "a".repeat(64),
  status: "draft",
  version: 2,
} satisfies Question;

describe("question approvals", () => {
  it("maps rows and activates only an exact version and source hash", () => {
    const approvals = rowsToApprovals([
      {
        question_id: pendingQuestion.id,
        question_version: 2,
        source_hash: "a".repeat(64),
      },
    ]);

    expect(isQuestionApproved(pendingQuestion, approvals)).toBe(true);
    expect(
      isQuestionApproved({ ...pendingQuestion, sourceHash: "b".repeat(64) }, approvals),
    ).toBe(false);
    expect(activeQuestionIds([pendingQuestion], approvals)).toContain(
      pendingQuestion.id,
    );
  });
});
