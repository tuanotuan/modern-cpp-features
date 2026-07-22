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
  language: "cpp",
  track: "cpp11",
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
    expect(taxonomy).not.toHaveProperty("language");
    expect(taxonomy).not.toHaveProperty("track");
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

  it("adds explicit language and track tags for a Python deck", () => {
    const taxonomy = buildQuestionTaxonomy(
      { ...question, id: "py3-generator-001", lessonId: "py3-generator" },
      {
        ...lesson,
        id: "py3-generator",
        language: "python",
        track: "python3",
        standard: "python3",
        tags: ["generator", "iteration"],
      },
    );

    expect(taxonomy).toMatchObject({
      deckId: "python-interview",
      language: "python",
      track: "python3",
      standard: "python3",
    });
    expect(taxonomy.tags).toContain("language::python");
    expect(taxonomy.tags).toContain("track::python3");
  });

  it("routes CMake lessons to the hidden Build Systems deck", () => {
    const taxonomy = buildQuestionTaxonomy(
      { ...question, id: "cmake-targets-001", lessonId: "cmake-targets" },
      {
        ...lesson,
        id: "cmake-targets",
        language: "cmake",
        track: "cmake",
        standard: "cmake",
        tags: ["targets", "transitive-usage-requirements"],
      },
    );

    expect(taxonomy).toMatchObject({
      deckId: "cmake-build-systems",
      language: "cmake",
      track: "cmake",
      standard: "cmake",
    });
    expect(taxonomy.tags).toContain("language::cmake");
    expect(taxonomy.tags).toContain("track::cmake");
  });
});
