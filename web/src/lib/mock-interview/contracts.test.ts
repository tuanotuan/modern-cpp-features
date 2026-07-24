import { describe, expect, it } from "vitest";

import {
  normalizeMockInterviewReport,
  type MockInterviewReport,
} from "./contracts";
import {
  mockCompetencyKeys,
  type MockCompetencyKey,
} from "./profile";

function competency(status: "assessed" | "not_assessed" = "assessed") {
  return {
    status,
    score: status === "assessed" ? 50 : null,
    summary: "Evidence summary.",
    strengths: [],
    gaps: [],
    evidenceQuestionIds: [],
  };
}

function allCompetencies(
  status: "assessed" | "not_assessed" = "assessed",
): MockInterviewReport["competencies"] {
  return Object.fromEntries(
    mockCompetencyKeys.map((key) => [key, competency(status)]),
  ) as unknown as MockInterviewReport["competencies"];
}

describe("mock interview report normalization", () => {
  it("derives assessed competency and overall scores only from asked questions", () => {
    const competencies = allCompetencies();
    const rawReport: MockInterviewReport = {
      overallScore: 99,
      readiness: "strong",
      summary: "Candidate report.",
      hiringSignal: "Conditional signal.",
      competencies,
      questionAssessments: [
        {
          questionId: "cpp11-reference-001",
          score: 80,
          verdict: "solid",
          summary: "Good C++ reasoning.",
          strengths: [],
          missedCriteria: [],
        },
        {
          questionId: "worldquant-tick-feed-correctness",
          score: 60,
          verdict: "partial",
          summary: "Some feed gaps remain.",
          strengths: [],
          missedCriteria: ["Missing replay policy."],
        },
        {
          questionId: "worldquant-legacy-migration",
          score: 40,
          verdict: "partial",
          summary: "Migration plan needs rollback.",
          strengths: [],
          missedCriteria: ["Missing rollback."],
        },
      ],
      strengths: [],
      priorityGaps: [],
      studyPlan: [],
    };
    const questionCompetencies: Record<string, MockCompetencyKey> = {
      "cpp11-reference-001": "modern_cpp",
      "worldquant-tick-feed-correctness": "tick_data_order_book",
      "worldquant-legacy-migration": "communication_ownership",
    };

    const normalized = normalizeMockInterviewReport({
      rawReport,
      questionCompetencies,
    });

    expect(normalized.competencies.modern_cpp.score).toBe(80);
    expect(normalized.competencies.tick_data_order_book.score).toBe(60);
    expect(normalized.competencies.communication_ownership.score).toBe(40);
    expect(normalized.competencies.scripting.status).toBe("not_assessed");
    expect(normalized.competencies.scripting.score).toBeNull();
    expect(normalized.overallScore).toBe(66);
    expect(normalized.readiness).toBe("developing");
  });

  it("rejects AI reports with missing or invented question IDs", () => {
    const competencies = allCompetencies("not_assessed");
    const report = {
      overallScore: 0,
      readiness: "not_ready",
      summary: "No evidence.",
      hiringSignal: "No signal.",
      competencies,
      questionAssessments: [
        {
          questionId: "invented-question",
          score: 0,
          verdict: "needs_work",
          summary: "Invented.",
          strengths: [],
          missedCriteria: [],
        },
        {
          questionId: "worldquant-tick-feed-correctness",
          score: 0,
          verdict: "needs_work",
          summary: "Empty.",
          strengths: [],
          missedCriteria: [],
        },
        {
          questionId: "worldquant-legacy-migration",
          score: 0,
          verdict: "needs_work",
          summary: "Empty.",
          strengths: [],
          missedCriteria: [],
        },
      ],
      strengths: [],
      priorityGaps: [],
      studyPlan: [],
    } satisfies MockInterviewReport;

    expect(() =>
      normalizeMockInterviewReport({
        rawReport: report,
        questionCompetencies: {
          "cpp11-reference-001": "modern_cpp",
          "worldquant-tick-feed-correctness": "tick_data_order_book",
          "worldquant-legacy-migration": "communication_ownership",
        },
      }),
    ).toThrow(/mismatched question set/);
  });
});
