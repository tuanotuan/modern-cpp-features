import { describe, expect, it } from "vitest";

import { lessonRegistrySchema, questionTaxonomySchema } from "./schema";

const shared = {
  order: 1,
  tags: ["objects"],
  prerequisites: [],
};

describe("multi-language lesson registry", () => {
  it("normalizes the legacy C++ standard field without changing old registries", () => {
    const registry = lessonRegistrySchema.parse({
      schemaVersion: 1,
      lessons: [
        {
          ...shared,
          id: "cpp11-auto",
          sourcePath: "cpp11/1_auto",
          standard: "cpp11",
        },
      ],
    });

    expect(registry.lessons[0]).toMatchObject({
      language: "cpp",
      track: "cpp11",
      standard: "cpp11",
    });
  });

  it("accepts the canonical Python language and track contract", () => {
    const registry = lessonRegistrySchema.parse({
      schemaVersion: 1,
      lessons: [
        {
          ...shared,
          id: "py3-objects",
          sourcePath: "python/01_objects",
          language: "python",
          track: "python3",
        },
      ],
    });

    expect(registry.lessons[0].standard).toBe("python3");
  });

  it("rejects a language and track mismatch", () => {
    expect(() =>
      lessonRegistrySchema.parse({
        schemaVersion: 1,
        lessons: [
          {
            ...shared,
            id: "invalid-track",
            sourcePath: "python/invalid",
            language: "python",
            track: "cpp20",
          },
        ],
      }),
    ).toThrow("does not belong");
  });

  it("requires explicit Python metadata on Python question taxonomy", () => {
    expect(() =>
      questionTaxonomySchema.parse({
        deckId: "python-interview",
        standard: "python3",
        topics: ["objects"],
        skill: "recall",
        difficulty: "beginner",
        responseMode: "text",
        sourceLessonId: "py3-objects",
        tags: [
          "deck::python-interview",
          "standard::python3",
          "topic::objects",
          "skill::recall",
          "difficulty::beginner",
          "response::text",
          "source::py3-objects",
        ],
      }),
    ).toThrow("inconsistent language/track");
  });
});
