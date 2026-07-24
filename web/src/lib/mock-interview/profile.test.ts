import { describe, expect, it } from "vitest";

import {
  buildWorldQuantGroundingCoverage,
  inferMockCompetency,
  selectWorldQuantQuestions,
  worldQuantMockSetsForDuration,
  WORLDQUANT_MOCK_SETS,
  WORLDQUANT_ROLE_QUESTIONS,
  type MockInterviewDuration,
  type MockInterviewQuestion,
} from "./profile";

const bankQuestions: MockInterviewQuestion[] = [
  {
    id: "cpp11-reference-001",
    origin: "question_bank",
    version: 1,
    contentRevision: "a".repeat(64),
    prompt: "Explain reference lifetime in this production scenario.",
    language: "cpp",
    track: "cpp11",
    responseMode: "text",
    estimatedMinutes: 5,
    competency: "data_pipeline_performance",
    selectionTopics: ["reference", "lifetime", "lesson::cpp11-reference"],
  },
  {
    id: "cpp11-enum-001",
    origin: "question_bank",
    version: 1,
    contentRevision: "b".repeat(64),
    prompt: "Compare scoped and unscoped enum behavior.",
    language: "cpp",
    track: "cpp11",
    responseMode: "text",
    estimatedMinutes: 3,
    competency: "modern_cpp",
    selectionTopics: ["enum", "lesson::cpp11-enum"],
  },
];

describe("WorldQuant mock profile", () => {
  it("stores exactly two fixed sets for every supported duration", () => {
    expect(WORLDQUANT_MOCK_SETS).toHaveLength(6);
    expect(new Set(WORLDQUANT_MOCK_SETS.map((mockSet) => mockSet.id)).size).toBe(
      6,
    );

    const expectedCounts: Record<MockInterviewDuration, number> = {
      30: 4,
      45: 5,
      60: 7,
    };
    for (const duration of [30, 45, 60] as const) {
      const sets = worldQuantMockSetsForDuration(duration);
      expect(sets).toHaveLength(2);
      for (const mockSet of sets) {
        expect(mockSet.questionIds).toHaveLength(expectedCounts[duration]);
        expect(new Set(mockSet.questionIds).size).toBe(
          mockSet.questionIds.length,
        );
        const estimatedMinutes = selectWorldQuantQuestions({
          setId: mockSet.id,
        }).reduce((sum, question) => sum + question.estimatedMinutes, 0);
        expect(estimatedMinutes).toBeLessThanOrEqual(duration);
      }
      const secondSetIds = new Set<string>(sets[1].questionIds);
      expect(
        sets[0].questionIds.some((questionId) =>
          secondSetIds.has(questionId),
        ),
      ).toBe(false);
    }
  });

  it("keeps each A/B family nested and resolves a set deterministically", () => {
    for (const variant of ["A", "B"] as const) {
      const idsByDuration = ([30, 45, 60] as const).map(
        (duration) =>
          worldQuantMockSetsForDuration(duration).find(
            (mockSet) => mockSet.variant === variant,
          )!.questionIds,
      );
      expect(idsByDuration[1].slice(0, 4)).toEqual(idsByDuration[0]);
      expect(idsByDuration[2].slice(0, 5)).toEqual(idsByDuration[1]);
    }

    const first = selectWorldQuantQuestions({ setId: "worldquant-60-b" });
    const second = selectWorldQuantQuestions({ setId: "worldquant-60-b" });
    expect(second.map((question) => question.id)).toEqual(
      first.map((question) => question.id),
    );
    expect(first.every((question) => question.origin === "role_profile")).toBe(
      true,
    );
  });

  it("does not expose a role question ID without a stable revision", () => {
    expect(WORLDQUANT_ROLE_QUESTIONS.every(
      (question) =>
        question.version > 0 &&
        question.contentRevision === "worldquant-jd-2025-v1",
    )).toBe(true);
  });

  it("reports bank-grounding gaps separately from curated role coverage", () => {
    const coverage = buildWorldQuantGroundingCoverage(bankQuestions);
    expect(coverage.counts.data_pipeline_performance).toBe(1);
    expect(coverage.counts.modern_cpp).toBe(1);
    expect(coverage.missingCompetencies).toContain("tick_data_order_book");
    expect(coverage.missingCompetencies).toContain("scripting");
  });

  it("resolves every stored question ID to a versioned curated question", () => {
    const questionIds = new Set(
      WORLDQUANT_ROLE_QUESTIONS.map((question) => question.id),
    );
    const storedQuestionIds = new Set<string>();
    for (const mockSet of WORLDQUANT_MOCK_SETS) {
      for (const questionId of mockSet.questionIds) {
        expect(questionIds.has(questionId)).toBe(true);
        storedQuestionIds.add(questionId);
      }
    }
    expect([...storedQuestionIds].sort()).toEqual([...questionIds].sort());
  });

  it("maps language and controlled topics to role competencies", () => {
    expect(
      inferMockCompetency({ language: "python", topics: ["automation"] }),
    ).toBe("scripting");
    expect(
      inferMockCompetency({ language: "cpp", topics: ["order-book"] }),
    ).toBe("tick_data_order_book");
    expect(
      inferMockCompetency({ language: "cmake", topics: ["build"] }),
    ).toBe("engineering_quality");
  });
});
