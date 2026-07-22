import { describe, expect, it } from "vitest";

import type { ContentManifest } from "../content/schema";

import { buildAdminDashboardSnapshot } from "./dashboard";

const hash = "a".repeat(64);

const manifest: ContentManifest = {
  schemaVersion: 1,
  sourceRevision: "b".repeat(64),
  lessons: [
    {
      id: "cpp11-example",
      sourcePath: "cpp11/example",
      language: "cpp",
      track: "cpp11",
      standard: "cpp11",
      order: 1,
      tags: ["example"],
      prerequisites: [],
      title: "Example",
      knowledgePath: "cpp11/example/knowledge.md",
      codePath: null,
      sourceHash: hash,
      sections: [
        { id: "overview", heading: "Overview", bodyMarkdown: "body", bodyText: "body" },
      ],
      checklistItems: [],
      code: null,
    },
    {
      id: "cpp20-empty",
      sourcePath: "cpp20/empty",
      language: "cpp",
      track: "cpp20",
      standard: "cpp20",
      order: 1,
      tags: ["empty"],
      prerequisites: [],
      title: "Empty",
      knowledgePath: "cpp20/empty/knowledge.md",
      codePath: null,
      sourceHash: "c".repeat(64),
      sections: [
        { id: "overview", heading: "Overview", bodyMarkdown: "body", bodyText: "body" },
      ],
      checklistItems: [],
      code: null,
    },
  ],
  questions: [
    {
      id: "cpp11-example-001",
      lessonId: "cpp11-example",
      type: "recall",
      difficulty: "beginner",
      estimatedMinutes: 3,
      prompt: "Explain the example in enough detail.",
      hint: "Think about the overview section.",
      answer: { short: "A sufficiently long short answer.", detailed: "A detailed answer long enough for validation." },
      rubric: { required: ["Explain the core example"], bonus: [], misconceptions: [] },
      sources: [{ sectionId: "overview" }],
      sourceHash: hash,
      status: "draft",
      version: 1,
      taxonomy: {
        deckId: "cpp-interview",
        standard: "cpp11",
        topics: ["example"],
        skill: "recall",
        difficulty: "beginner",
        responseMode: "text",
        sourceLessonId: "cpp11-example",
        tags: [
          "deck::cpp-interview",
          "standard::cpp11",
          "topic::example",
          "skill::recall",
          "difficulty::beginner",
          "response::text",
          "source::cpp11-example",
        ],
      },
    },
  ],
};

describe("admin dashboard snapshot", () => {
  it("counts approved drafts as active and reports uncovered lessons", () => {
    const snapshot = buildAdminDashboardSnapshot(
      manifest,
      [{ questionId: "cpp11-example-001", questionVersion: 1, sourceHash: hash }],
      {
        version: 1,
        reviews: [
          {
            questionId: "cpp11-example-001",
            reviewedOn: "2026-07-19",
            rating: "hard",
            nextDueOn: "2026-07-20",
          },
        ],
      },
      [],
      "2026-07-20",
    );

    expect(snapshot.metrics).toMatchObject({
      lessons: 2,
      questions: 1,
      activeQuestions: 1,
      pendingQuestions: 0,
      uncoveredLessons: 1,
      dueQuestions: 1,
    });
    expect(snapshot.questions[0].adminStatus).toBe("active");
    expect(snapshot.questions[0].learning).toMatchObject({
      state: "review",
      dueOn: "2026-07-20",
    });
    expect(snapshot.questions[0].reviewHistory).toHaveLength(1);
    expect(snapshot.ratingCounts.hard).toBe(1);
  });
});
