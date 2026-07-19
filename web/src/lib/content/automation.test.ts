import { describe, expect, it } from "vitest";

import { approveQuestion, mergeDiscoveredLessons } from "./automation";
import type { LessonRegistry, Question } from "./schema";

const registry: LessonRegistry = {
  schemaVersion: 1,
  lessons: [
    {
      id: "cpp11-auto",
      sourcePath: "cpp11/1_auto",
      standard: "cpp11",
      order: 1,
      tags: ["auto"],
      prerequisites: [],
    },
  ],
};

describe("content automation", () => {
  it("registers new knowledge directories deterministically", () => {
    const result = mergeDiscoveredLessons(registry, [
      "cpp11/2_nullptr",
      "cpp11/1_auto",
      "cpp20/01_designated initializer",
    ]);

    expect(result.additions).toEqual([
      {
        id: "cpp11-nullptr",
        sourcePath: "cpp11/2_nullptr",
        standard: "cpp11",
        order: 2,
        tags: ["nullptr"],
        prerequisites: [],
      },
      {
        id: "cpp20-designated-initializer",
        sourcePath: "cpp20/01_designated initializer",
        standard: "cpp20",
        order: 1,
        tags: ["designated", "initializer"],
        prerequisites: [],
      },
    ]);
  });

  it("rejects an automatically derived ID collision", () => {
    expect(() =>
      mergeDiscoveredLessons(registry, ["cpp11/99_auto"]),
    ).toThrow(/collides/);
  });

  it("approves drafts without bumping v1 and bumps reviewed questions", () => {
    const draft = {
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
      version: 1,
    } satisfies Question;

    expect(approveQuestion(draft, "b".repeat(64))).toMatchObject({
      status: "verified",
      sourceHash: "b".repeat(64),
      version: 1,
    });
    expect(
      approveQuestion({ ...draft, status: "verified", version: 2 }, "c".repeat(64)),
    ).toMatchObject({ status: "verified", version: 3 });
  });
});
