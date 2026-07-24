import { describe, expect, it } from "vitest";

import {
  buildWorldQuantGroundingCoverage,
  inferMockCompetency,
  selectWorldQuantQuestions,
  WORLDQUANT_ROLE_QUESTIONS,
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
  it("builds the expected fixed-size role mix without duplicate questions", () => {
    const selected = selectWorldQuantQuestions({
      durationMinutes: 60,
      bankQuestions,
      seed: "stable-session",
    });

    expect(selected).toHaveLength(7);
    expect(new Set(selected.map((question) => question.id)).size).toBe(7);
    expect(selected.filter((question) => question.origin === "question_bank")).toHaveLength(1);
    expect(
      selected.some(
        (question) => question.id === "worldquant-tick-feed-correctness",
      ),
    ).toBe(true);
    expect(
      selected.some(
        (question) => question.id === "worldquant-researcher-collaboration",
      ),
    ).toBe(true);
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

  it("replaces a curated round when an approved bank question grounds the same role competency", () => {
    const cmakeQuestion: MockInterviewQuestion = {
      id: "cmake-target-usage-requirements-001",
      origin: "question_bank",
      version: 1,
      contentRevision: "c".repeat(64),
      prompt: "Explain target usage requirements in a migration scenario.",
      language: "cmake",
      track: "cmake",
      responseMode: "text",
      estimatedMinutes: 5,
      competency: "engineering_quality",
      selectionTopics: ["cmake", "build", "lesson::cmake-targets"],
    };
    const selected = selectWorldQuantQuestions({
      durationMinutes: 45,
      bankQuestions: [...bankQuestions, cmakeQuestion],
      seed: "grounded-session",
    });

    expect(selected.map((question) => question.id)).toContain(
      cmakeQuestion.id,
    );
    expect(selected.map((question) => question.id)).not.toContain(
      "worldquant-cmake-delivery",
    );
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
