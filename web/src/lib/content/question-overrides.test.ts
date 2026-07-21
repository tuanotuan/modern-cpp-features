import { describe, expect, it } from "vitest";

import type { ContentManifest } from "./schema";
import {
  applyQuestionOverrides,
  editableQuestionContent,
  rowsToQuestionOverrides,
} from "./question-overrides";

const hash = "a".repeat(64);
const manifest = {
  schemaVersion: 1,
  sourceRevision: "b".repeat(64),
  lessons: [
    {
      id: "cpp11-move",
      sourcePath: "cpp11/move",
      standard: "cpp11",
      order: 1,
      tags: ["move-semantics"],
      prerequisites: [],
      title: "Move",
      knowledgePath: "cpp11/move/knowledge.md",
      codePath: null,
      sourceHash: hash,
      sections: [
        { id: "ownership", heading: "Ownership", bodyMarkdown: "x", bodyText: "x" },
      ],
      checklistItems: [],
      code: null,
    },
  ],
  questions: [
    {
      id: "cpp11-move-001",
      lessonId: "cpp11-move",
      type: "recall",
      responseMode: "text",
      difficulty: "beginner",
      estimatedMinutes: 3,
      prompt: "Explain move semantics clearly.",
      hint: "Think about ownership.",
      answer: { short: "Ownership is transferred.", detailed: "The resource ownership is transferred without a deep copy." },
      rubric: { required: ["Explain ownership transfer"], bonus: [], misconceptions: [] },
      sources: [{ sectionId: "ownership" }],
      sourceHash: hash,
      status: "verified",
      version: 1,
      taxonomy: {
        deckId: "cpp-interview",
        standard: "cpp11",
        topics: ["move-semantics"],
        skill: "recall",
        difficulty: "beginner",
        responseMode: "text",
        sourceLessonId: "cpp11-move",
        tags: ["deck::cpp-interview", "standard::cpp11", "topic::move-semantics", "skill::recall", "difficulty::beginner", "response::text", "source::cpp11-move"],
      },
    },
  ],
} satisfies ContentManifest;

describe("question overrides", () => {
  it("applies an edit as a new draft and rebuilds taxonomy", () => {
    const content = {
      ...editableQuestionContent(manifest.questions[0]),
      type: "scenario" as const,
      difficulty: "advanced" as const,
      prompt: "Design ownership transfer for a trading gateway resource.",
    };
    const result = applyQuestionOverrides(manifest, [
      {
        questionId: "cpp11-move-001",
        baseQuestionVersion: 1,
        questionVersion: 2,
        sourceHash: hash,
        content,
        edited: true,
        archived: false,
      },
    ]);

    expect(result.questions[0]).toMatchObject({
      version: 2,
      status: "draft",
      prompt: content.prompt,
      taxonomy: { skill: "scenario", difficulty: "advanced" },
    });
  });

  it("archives without destroying the base question", () => {
    const result = applyQuestionOverrides(manifest, [
      {
        questionId: "cpp11-move-001",
        baseQuestionVersion: 1,
        questionVersion: 1,
        sourceHash: hash,
        content: editableQuestionContent(manifest.questions[0]),
        edited: false,
        archived: true,
      },
    ]);

    expect(result.questions[0].status).toBe("archived");
    expect(manifest.questions[0].status).toBe("verified");
  });

  it("marks an edited override stale when the repository base version changes", () => {
    const changedManifest: ContentManifest = {
      ...manifest,
      questions: [{ ...manifest.questions[0], version: 3 }],
    };
    const result = applyQuestionOverrides(changedManifest, [
      {
        questionId: "cpp11-move-001",
        baseQuestionVersion: 1,
        questionVersion: 2,
        sourceHash: hash,
        content: editableQuestionContent(manifest.questions[0]),
        edited: true,
        archived: false,
      },
    ]);

    expect(result.questions[0]).toMatchObject({
      version: 3,
      status: "needs_review",
    });
  });

  it("ignores malformed database rows", () => {
    expect(
      rowsToQuestionOverrides([
        {
          question_id: "cpp11-move-001",
          base_question_version: 1,
          question_version: 2,
          source_hash: hash,
          content: {},
          is_edited: true,
          is_archived: false,
        },
      ]),
    ).toEqual([]);
  });
});
