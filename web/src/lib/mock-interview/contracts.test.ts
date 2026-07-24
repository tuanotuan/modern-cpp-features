import { describe, expect, it } from "vitest";

import {
  mockInterviewReportRequestSchema,
  normalizeMockInterviewReport,
  type MockInterviewReport,
} from "./contracts";
import {
  mockCompetencyKeys,
  WORLDQUANT_MOCK_SETS,
  WORLDQUANT_ROLE_QUESTIONS,
  type MockCompetencyKey,
  type MockInterviewSet,
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

function reportRequestForSet(mockSet: MockInterviewSet) {
  const questionById = new Map(
    WORLDQUANT_ROLE_QUESTIONS.map((question) => [question.id, question]),
  );
  return {
    idempotencyKey: "23966699-ebc3-4b74-9a16-0ca48f4a47c7",
    sessionId: "9f58ceae-6ce7-4d56-bf6e-2be2256cc063",
    profileId: "worldquant-tick-data-engineer",
    profileVersion: 3,
    setId: mockSet.id,
    setVersion: mockSet.version,
    sourceRevision: "a".repeat(40),
    durationMinutes: mockSet.durationMinutes,
    elapsedSeconds: 60,
    items: mockSet.questionIds.map((questionId) => {
      const question = questionById.get(questionId)!;
      return {
        questionId,
        origin: question.origin,
        version: question.version,
        contentRevision: question.contentRevision,
        response: "A candidate answer.",
        explanation: "The relevant engineering trade-offs.",
        elapsedSeconds: 30,
      };
    }),
  };
}

describe("mock interview report requests", () => {
  it("accepts the exact versioned composition of all six stored sets", () => {
    for (const mockSet of WORLDQUANT_MOCK_SETS) {
      expect(
        mockInterviewReportRequestSchema.safeParse(
          reportRequestForSet(mockSet),
        ).success,
      ).toBe(true);
    }
  });

  it("rejects a wrong set version, duration or question order", () => {
    const request = reportRequestForSet(WORLDQUANT_MOCK_SETS[0]);
    expect(
      mockInterviewReportRequestSchema.safeParse({
        ...request,
        setVersion: 99,
      }).success,
    ).toBe(false);
    expect(
      mockInterviewReportRequestSchema.safeParse({
        ...request,
        durationMinutes: 45,
      }).success,
    ).toBe(false);
    expect(
      mockInterviewReportRequestSchema.safeParse({
        ...request,
        items: [...request.items].reverse(),
      }).success,
    ).toBe(false);
  });

  it("rejects profile-v2 payloads and legacy answer fields", () => {
    const request = reportRequestForSet(WORLDQUANT_MOCK_SETS[0]);
    expect(
      mockInterviewReportRequestSchema.safeParse({
        ...request,
        profileVersion: 2,
      }).success,
    ).toBe(false);
    expect(
      mockInterviewReportRequestSchema.safeParse({
        ...request,
        items: request.items.map(({ response, explanation, ...item }) => ({
          ...item,
          answer: `${response}\n${explanation}`,
        })),
      }).success,
    ).toBe(false);
  });
});

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

    const executionCapped = normalizeMockInterviewReport({
      rawReport,
      questionCompetencies,
      executionByQuestionId: {
        "cpp11-reference-001": "compile_error",
        "worldquant-legacy-migration": "sandbox_error",
      },
    });
    expect(executionCapped.questionAssessments[0]?.score).toBe(39);
    expect(executionCapped.questionAssessments[0]?.verdict).toBe(
      "needs_work",
    );
    expect(
      executionCapped.competencies.communication_ownership.score,
    ).toBe(40);
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
