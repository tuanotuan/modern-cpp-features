import { z } from "zod";

import {
  matchesWorldQuantMockSet,
  mockCompetencyKeys,
  mockInterviewSetIds,
  type MockCompetencyKey,
} from "./profile";

const kebabIdSchema = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(120);

export const mockInterviewReportRequestSchema = z.object({
  sessionId: z.string().uuid(),
  profileId: z.literal("worldquant-tick-data-engineer"),
  profileVersion: z.literal(2),
  setId: z.enum(mockInterviewSetIds),
  setVersion: z.number().int().positive(),
  sourceRevision: z.string().regex(/^[a-f0-9]{40,64}$/),
  durationMinutes: z.union([z.literal(30), z.literal(45), z.literal(60)]),
  elapsedSeconds: z.number().int().min(0).max(4 * 60 * 60),
  items: z
    .array(
      z.object({
        questionId: kebabIdSchema,
        origin: z.enum(["question_bank", "role_profile"]),
        version: z.number().int().positive(),
        contentRevision: z.string().trim().min(1).max(128),
        answer: z.string().trim().max(12_000),
        elapsedSeconds: z.number().int().min(0).max(2 * 60 * 60),
      }),
    )
    .min(3)
    .max(8),
}).superRefine((request, context) => {
  const { items } = request;
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.questionId)) {
      context.addIssue({
        code: "custom",
        path: ["items", index, "questionId"],
        message: "Mock interview cannot contain a duplicate question",
      });
    }
    seen.add(item.questionId);
  });
  if (
    !matchesWorldQuantMockSet({
      setId: request.setId,
      setVersion: request.setVersion,
      durationMinutes: request.durationMinutes,
      questionIds: items.map((item) => item.questionId),
    })
  ) {
    context.addIssue({
      code: "custom",
      path: ["setId"],
      message: "Mock report request does not match its versioned question set",
    });
  }
});

const mockVerdictSchema = z.enum([
  "needs_work",
  "partial",
  "solid",
  "strong",
]);

const competencyAssessmentSchema = z.object({
  status: z.enum(["assessed", "not_assessed"]),
  score: z.number().int().min(0).max(100).nullable(),
  summary: z.string().trim().min(1).max(700),
  strengths: z.array(z.string().trim().min(1).max(300)).max(4),
  gaps: z.array(z.string().trim().min(1).max(350)).max(4),
  evidenceQuestionIds: z.array(kebabIdSchema).max(8),
});

export const mockInterviewReportSchema = z.object({
  overallScore: z.number().int().min(0).max(100),
  readiness: z.enum([
    "not_ready",
    "developing",
    "interview_ready",
    "strong",
  ]),
  summary: z.string().trim().min(1).max(1200),
  hiringSignal: z.string().trim().min(1).max(700),
  competencies: z.object({
    modern_cpp: competencyAssessmentSchema,
    tick_data_order_book: competencyAssessmentSchema,
    data_pipeline_performance: competencyAssessmentSchema,
    engineering_quality: competencyAssessmentSchema,
    scripting: competencyAssessmentSchema,
    communication_ownership: competencyAssessmentSchema,
  }),
  questionAssessments: z
    .array(
      z.object({
        questionId: kebabIdSchema,
        score: z.number().int().min(0).max(100),
        verdict: mockVerdictSchema,
        summary: z.string().trim().min(1).max(600),
        strengths: z.array(z.string().trim().min(1).max(300)).max(3),
        missedCriteria: z.array(z.string().trim().min(1).max(350)).max(5),
      }),
    )
    .min(3)
    .max(8),
  strengths: z.array(z.string().trim().min(1).max(350)).max(5),
  priorityGaps: z.array(z.string().trim().min(1).max(400)).max(5),
  studyPlan: z
    .array(
      z.object({
        priority: z.number().int().min(1).max(5),
        topic: z.string().trim().min(1).max(180),
        action: z.string().trim().min(1).max(500),
        questionIds: z.array(kebabIdSchema).max(6),
      }),
    )
    .max(5),
});

export type MockInterviewReportRequest = z.infer<
  typeof mockInterviewReportRequestSchema
>;
export type MockInterviewReport = z.infer<typeof mockInterviewReportSchema>;

export const mockInterviewReportJsonSchema = {
  type: "object",
  additionalProperties: false,
  properties: {
    overallScore: { type: "integer", minimum: 0, maximum: 100 },
    readiness: {
      type: "string",
      enum: ["not_ready", "developing", "interview_ready", "strong"],
    },
    summary: { type: "string" },
    hiringSignal: { type: "string" },
    competencies: {
      type: "object",
      additionalProperties: false,
      properties: Object.fromEntries(
        mockCompetencyKeys.map((key) => [
          key,
          {
            type: "object",
            additionalProperties: false,
            properties: {
              status: {
                type: "string",
                enum: ["assessed", "not_assessed"],
              },
              score: { type: ["integer", "null"], minimum: 0, maximum: 100 },
              summary: { type: "string" },
              strengths: {
                type: "array",
                items: { type: "string" },
                maxItems: 4,
              },
              gaps: {
                type: "array",
                items: { type: "string" },
                maxItems: 4,
              },
              evidenceQuestionIds: {
                type: "array",
                items: { type: "string" },
                maxItems: 8,
              },
            },
            required: [
              "status",
              "score",
              "summary",
              "strengths",
              "gaps",
              "evidenceQuestionIds",
            ],
          },
        ]),
      ),
      required: [...mockCompetencyKeys],
    },
    questionAssessments: {
      type: "array",
      minItems: 3,
      maxItems: 8,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          questionId: { type: "string" },
          score: { type: "integer", minimum: 0, maximum: 100 },
          verdict: {
            type: "string",
            enum: ["needs_work", "partial", "solid", "strong"],
          },
          summary: { type: "string" },
          strengths: {
            type: "array",
            items: { type: "string" },
            maxItems: 3,
          },
          missedCriteria: {
            type: "array",
            items: { type: "string" },
            maxItems: 5,
          },
        },
        required: [
          "questionId",
          "score",
          "verdict",
          "summary",
          "strengths",
          "missedCriteria",
        ],
      },
    },
    strengths: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
    },
    priorityGaps: {
      type: "array",
      items: { type: "string" },
      maxItems: 5,
    },
    studyPlan: {
      type: "array",
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        properties: {
          priority: { type: "integer", minimum: 1, maximum: 5 },
          topic: { type: "string" },
          action: { type: "string" },
          questionIds: {
            type: "array",
            items: { type: "string" },
            maxItems: 6,
          },
        },
        required: ["priority", "topic", "action", "questionIds"],
      },
    },
  },
  required: [
    "overallScore",
    "readiness",
    "summary",
    "hiringSignal",
    "competencies",
    "questionAssessments",
    "strengths",
    "priorityGaps",
    "studyPlan",
  ],
} as const;

export function normalizeMockInterviewReport({
  rawReport,
  questionCompetencies,
}: {
  rawReport: MockInterviewReport;
  questionCompetencies: Record<string, MockCompetencyKey>;
}): MockInterviewReport {
  const report = mockInterviewReportSchema.parse(rawReport);
  const expectedIds = Object.keys(questionCompetencies);
  const assessmentById = new Map(
    report.questionAssessments.map((assessment) => [
      assessment.questionId,
      assessment,
    ]),
  );
  if (
    assessmentById.size !== expectedIds.length ||
    expectedIds.some((questionId) => !assessmentById.has(questionId)) ||
    [...assessmentById].some(([questionId]) => !(questionId in questionCompetencies))
  ) {
    throw new Error("AI mock report returned a mismatched question set");
  }

  const questionAssessments = expectedIds.map((questionId) => {
    const assessment = assessmentById.get(questionId)!;
    return {
      ...assessment,
      verdict:
        assessment.score >= 85
          ? "strong" as const
          : assessment.score >= 65
            ? "solid" as const
            : assessment.score >= 40
              ? "partial" as const
              : "needs_work" as const,
    };
  });
  const normalizedAssessmentById = new Map(
    questionAssessments.map((assessment) => [
      assessment.questionId,
      assessment,
    ]),
  );
  const competencies = { ...report.competencies };
  let weightedScore = 0;
  let assessedWeight = 0;

  for (const key of mockCompetencyKeys) {
    const evidenceQuestionIds = expectedIds.filter(
      (questionId) => questionCompetencies[questionId] === key,
    );
    if (!evidenceQuestionIds.length) {
      competencies[key] = {
        status: "not_assessed",
        score: null,
        summary: "Buổi mock này chưa có câu đủ trực tiếp để đánh giá năng lực này.",
        strengths: [],
        gaps: [],
        evidenceQuestionIds: [],
      };
      continue;
    }

    const scores = evidenceQuestionIds.map(
      (questionId) => normalizedAssessmentById.get(questionId)!.score,
    );
    const score = Math.round(
      scores.reduce((sum, value) => sum + value, 0) / scores.length,
    );
    const current = competencies[key];
    competencies[key] = {
      ...current,
      status: "assessed",
      score,
      summary:
        current.status === "assessed"
          ? current.summary
          : `Đã đánh giá qua ${evidenceQuestionIds.length} câu trong buổi mock.`,
      evidenceQuestionIds,
    };
    const weight = mockCompetencyWeight(key);
    weightedScore += score * weight;
    assessedWeight += weight;
  }

  const overallScore =
    assessedWeight > 0 ? Math.round(weightedScore / assessedWeight) : 0;

  return {
    ...report,
    overallScore,
    readiness:
      overallScore >= 85
        ? "strong"
        : overallScore >= 70
          ? "interview_ready"
          : overallScore >= 45
            ? "developing"
            : "not_ready",
    competencies,
    questionAssessments,
    studyPlan: report.studyPlan
      .map((item) => ({
        ...item,
        questionIds: item.questionIds.filter((questionId) =>
          expectedIds.includes(questionId),
        ),
      }))
      .sort((left, right) => left.priority - right.priority),
  };
}

function mockCompetencyWeight(key: MockCompetencyKey) {
  const weights: Record<MockCompetencyKey, number> = {
    modern_cpp: 30,
    tick_data_order_book: 25,
    data_pipeline_performance: 15,
    engineering_quality: 10,
    scripting: 10,
    communication_ownership: 10,
  };
  return weights[key];
}
