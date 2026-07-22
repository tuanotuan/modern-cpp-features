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

  it("accepts the canonical CMake language and track contract", () => {
    const registry = lessonRegistrySchema.parse({
      schemaVersion: 1,
      lessons: [
        {
          ...shared,
          id: "cmake-targets",
          sourcePath: "cmake/01_targets",
          language: "cmake",
          track: "cmake",
        },
      ],
    });

    expect(registry.lessons[0]).toMatchObject({
      language: "cmake",
      track: "cmake",
      standard: "cmake",
    });
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

  it("requires explicit CMake metadata on Build Systems taxonomy", () => {
    expect(() =>
      questionTaxonomySchema.parse({
        deckId: "cmake-build-systems",
        standard: "cmake",
        topics: ["targets"],
        skill: "recall",
        difficulty: "beginner",
        responseMode: "text",
        sourceLessonId: "cmake-targets",
        tags: [
          "deck::cmake-build-systems",
          "standard::cmake",
          "topic::targets",
          "skill::recall",
          "difficulty::beginner",
          "response::text",
          "source::cmake-targets",
        ],
      }),
    ).toThrow("inconsistent language/track");
  });
});
