import { describe, expect, it } from "vitest";

import type { AiQuestionDraft } from "./drafts";
import { materializeDatabaseQuestionDrafts } from "./db-generation";
import type { GeneratedLesson } from "./schema";

const lesson = {
  id: "cpp11-move-semantics",
  sourcePath: "cpp11/01_move",
  title: "Move semantics",
  language: "cpp",
  track: "cpp11",
  standard: "cpp11",
  order: 1,
  tags: ["move-semantics", "ownership"],
  prerequisites: [],
  knowledgePath: "cpp11/01_move/knowledge.md",
  codePath: null,
  sourceHash: "a".repeat(64),
  sections: [
    {
      id: "ownership",
      heading: "Ownership",
      bodyMarkdown: "Move transfers ownership.",
      bodyText: "Move transfers ownership.",
    },
  ],
  checklistItems: [],
  code: null,
} satisfies GeneratedLesson;

const draft = {
  type: "scenario",
  responseMode: "text",
  difficulty: "intermediate",
  estimatedMinutes: 4,
  prompt: "Một hot path chuyển ownership thì nên thiết kế thế nào?",
  code: null,
  hint: "Xem lifetime và chi phí copy.",
  answer: {
    short: "Dùng move khi ownership được chuyển rõ ràng.",
    detailed: "Move tránh copy tài nguyên nhưng vẫn phải giữ lifetime và invariant rõ ràng.",
  },
  rubric: {
    required: ["Nêu đúng ownership transfer"],
    bonus: [],
    misconceptions: ["Cho rằng move luôn bằng không chi phí"],
  },
  sources: [{ sectionId: "ownership" }],
} satisfies AiQuestionDraft;

describe("DB-native generated question materialization", () => {
  it("adds deterministic taxonomy and an immutable revision checksum", () => {
    const [result] = materializeDatabaseQuestionDrafts(lesson, [draft]);

    expect(result.taxonomy.sourceLessonId).toBe(lesson.id);
    expect(result.taxonomy.tags).toContain("skill::scenario");
    expect(result.contentChecksum).toMatch(/^[a-f0-9]{64}$/);
    expect(materializeDatabaseQuestionDrafts(lesson, [draft])[0].contentChecksum)
      .toBe(result.contentChecksum);
  });

  it("changes the checksum when generated content changes", () => {
    const first = materializeDatabaseQuestionDrafts(lesson, [draft])[0];
    const second = materializeDatabaseQuestionDrafts(lesson, [
      { ...draft, hint: "Một gợi ý khác đủ dài." },
    ])[0];

    expect(second.contentChecksum).not.toBe(first.contentChecksum);
  });
});
