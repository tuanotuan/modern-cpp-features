import { describe, expect, it } from "vitest";

import {
  buildContentBackfillPayload,
  questionRevisionChecksum,
  renderContentBackfillSql,
} from "./backfill";
import type { ContentManifest } from "./schema";

const hash = "a".repeat(64);
const manifest = {
  schemaVersion: 1,
  sourceRevision: "b".repeat(64),
  lessons: [
    {
      id: "cpp11-example",
      sourcePath: "cpp11/01_example",
      standard: "cpp11",
      order: 1,
      tags: ["example"],
      prerequisites: [],
      title: "Example",
      knowledgePath: "cpp11/01_example/knowledge.md",
      codePath: null,
      sourceHash: hash,
      sections: [{ id: "overview", heading: "Overview", bodyMarkdown: "Body", bodyText: "Body" }],
      checklistItems: [],
      code: null,
    },
  ],
  questions: [
    {
      id: "cpp11-example-001",
      lessonId: "cpp11-example",
      type: "recall",
      responseMode: "text",
      difficulty: "beginner",
      estimatedMinutes: 2,
      prompt: "Explain this example in an interview.",
      hint: "Start with the core rule.",
      answer: { short: "A sufficiently long short answer.", detailed: "A sufficiently detailed canonical explanation." },
      rubric: { required: ["States the main rule"], bonus: [], misconceptions: [] },
      sources: [{ sectionId: "overview" }],
      sourceHash: hash,
      status: "verified",
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
} satisfies ContentManifest;

describe("content bank backfill", () => {
  it("builds deterministic counts and checksums", () => {
    const input = {
      manifest,
      sourceCommitSha: "c".repeat(40),
      knowledgeMarkdownByLessonId: new Map([["cpp11-example", "# Example\n"]]),
      rawQuestionMetadataById: new Map([
        ["cpp11-example-001", { origin: "pilot" as const, lifecycleStatus: "verified" as const }],
      ]),
    };
    const first = buildContentBackfillPayload(input);
    const second = buildContentBackfillPayload(input);

    expect(first).toEqual(second);
    expect(first.expected).toMatchObject({ lessons: 1, questions: 1 });
    expect(first.lessons[0].knowledgeMarkdown).toBe("# Example\r\n");
    expect(first.questions[0].contentChecksum).toBe(
      questionRevisionChecksum(manifest.questions[0]),
    );
  });

  it("fails closed when source material or raw question metadata is missing", () => {
    expect(() =>
      buildContentBackfillPayload({
        manifest,
        sourceCommitSha: "c".repeat(40),
        knowledgeMarkdownByLessonId: new Map(),
        rawQuestionMetadataById: new Map(),
      }),
    ).toThrow("Missing knowledge markdown");
  });

  it("renders a single SQL call and escapes the admin login", () => {
    const payload = buildContentBackfillPayload({
      manifest,
      sourceCommitSha: "c".repeat(40),
      knowledgeMarkdownByLessonId: new Map([["cpp11-example", "# Example\n"]]),
      rawQuestionMetadataById: new Map([
        ["cpp11-example-001", { origin: "pilot", lifecycleStatus: "verified" }],
      ]),
    });

    expect(renderContentBackfillSql(payload, "tuano'tuan")).toContain(
      "'tuano''tuan'",
    );
    expect(renderContentBackfillSql(payload)).toContain(
      "public.backfill_content_question_bank",
    );
  });
});
