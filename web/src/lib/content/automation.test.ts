import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  approveQuestion,
  discoverKnowledgeDirectories,
  mergeDiscoveredLessons,
} from "./automation";
import type { LessonRegistry, Question } from "./schema";

const registry: LessonRegistry = {
  schemaVersion: 1,
  lessons: [
    {
      id: "cpp11-auto",
      sourcePath: "cpp11/1_auto",
      language: "cpp",
      track: "cpp11",
      standard: "cpp11",
      order: 1,
      tags: ["auto"],
      prerequisites: [],
    },
  ],
};

describe("content automation", () => {
  it("discovers knowledge files under both C++ and Python source roots", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "recall-discovery-"));
    try {
      await Promise.all([
        mkdir(path.join(repoRoot, "cpp11", "01_auto"), { recursive: true }),
        mkdir(path.join(repoRoot, "python", "01_generators"), { recursive: true }),
        mkdir(path.join(repoRoot, "notes", "ignored"), { recursive: true }),
      ]);
      await Promise.all([
        writeFile(path.join(repoRoot, "cpp11", "01_auto", "knowledge.md"), "# Auto"),
        writeFile(path.join(repoRoot, "python", "01_generators", "knowledge.md"), "# Generators"),
        writeFile(path.join(repoRoot, "notes", "ignored", "knowledge.md"), "# Ignored"),
      ]);

      expect(await discoverKnowledgeDirectories(repoRoot)).toEqual([
        "cpp11/01_auto",
        "python/01_generators",
      ]);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });

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
        language: "cpp",
        track: "cpp11",
        standard: "cpp11",
        order: 2,
        tags: ["nullptr"],
        prerequisites: [],
      },
      {
        id: "cpp20-designated-initializer",
        sourcePath: "cpp20/01_designated initializer",
        language: "cpp",
        track: "cpp20",
        standard: "cpp20",
        order: 1,
        tags: ["designated", "initializer"],
        prerequisites: [],
      },
    ]);
  });

  it("registers Python lessons in the Python 3 interview deck", () => {
    const result = mergeDiscoveredLessons(registry, [
      "cpp11/1_auto",
      "python/02_data-model",
      "python/01_iterators-generators",
    ]);

    expect(result.additions).toEqual([
      {
        id: "python-iterators-generators",
        sourcePath: "python/01_iterators-generators",
        language: "python",
        track: "python3",
        standard: "python3",
        order: 1,
        tags: ["iterators", "generators"],
        prerequisites: [],
      },
      {
        id: "python-data-model",
        sourcePath: "python/02_data-model",
        language: "python",
        track: "python3",
        standard: "python3",
        order: 2,
        tags: ["data", "model"],
        prerequisites: [],
      },
    ]);
  });

  it("rejects an automatically derived ID collision", () => {
    expect(() =>
      mergeDiscoveredLessons(registry, ["cpp11/1_auto", "cpp11/99_auto"]),
    ).toThrow(/collides/);
  });

  it("detects removed lessons and treats a stable-ID path change as a move", () => {
    expect(mergeDiscoveredLessons(registry, []).removals).toEqual(
      registry.lessons,
    );
    const moved = mergeDiscoveredLessons(registry, ["cpp11/99_auto"]);
    expect(moved.removals).toEqual([]);
    expect(moved.moves).toEqual([
      { id: "cpp11-auto", from: "cpp11/1_auto", to: "cpp11/99_auto" },
    ]);
    expect(moved.registry.lessons[0].sourcePath).toBe("cpp11/99_auto");
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
