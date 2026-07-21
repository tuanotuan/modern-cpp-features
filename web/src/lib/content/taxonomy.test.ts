import { describe, expect, it } from "vitest";

import type { GeneratedLesson, Question } from "./schema";
import { buildQuestionTaxonomy } from "./taxonomy";

const question = {
  id: "cpp11-auto-001",
  lessonId: "cpp11-auto",
  type: "code_reasoning",
  responseMode: "code",
  difficulty: "intermediate",
} as Question;

const lesson = {
  id: "cpp11-auto",
  standard: "cpp11",
  tags: ["type-deduction", "reference", "reference"],
} as GeneratedLesson;

describe("question taxonomy", () => {
  it("derives controlled, deduplicated tags from trusted content metadata", () => {
    const taxonomy = buildQuestionTaxonomy(question, lesson);

    expect(taxonomy).toMatchObject({
      deckId: "cpp-interview",
      standard: "cpp11",
      topics: ["reference", "type-deduction"],
      skill: "code_reasoning",
      difficulty: "intermediate",
      responseMode: "code",
      sourceLessonId: "cpp11-auto",
    });
    expect(taxonomy.tags).toContain("topic::type-deduction");
    expect(taxonomy.tags).toContain("skill::code-reasoning");
    expect(new Set(taxonomy.tags).size).toBe(taxonomy.tags.length);
  });

  it("defaults legacy questions to a text response and rejects mismatched lessons", () => {
    expect(
      buildQuestionTaxonomy({ ...question, responseMode: undefined }, lesson)
        .responseMode,
    ).toBe("text");
    expect(() =>
      buildQuestionTaxonomy(question, { ...lesson, id: "cpp11-nullptr" }),
    ).toThrow(/belongs to cpp11-auto/);
  });
});
