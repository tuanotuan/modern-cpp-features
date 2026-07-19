import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  findRepoRoot,
  loadContentManifest,
  sectionIdFromHeading,
} from "./loader";

describe("content loader", () => {
  it("normalizes numbered Markdown headings", () => {
    expect(sectionIdFromHeading("4. `const` vs `constexpr`")).toBe(
      "const-vs-constexpr",
    );
  });

  it("imports the current repository corpus", async () => {
    const repoRoot = await findRepoRoot(import.meta.dirname);
    const manifest = await loadContentManifest(repoRoot, path.join(repoRoot, "web"));

    expect(manifest.lessons).toHaveLength(22);
    expect(manifest.lessons.every((lesson) => lesson.codePath !== null)).toBe(true);
    expect(
      manifest.lessons.reduce(
        (total, lesson) => total + lesson.checklistItems.length,
        0,
      ),
    ).toBe(117);
  });

  it("validates the pilot question references", async () => {
    const repoRoot = await findRepoRoot(import.meta.dirname);
    const manifest = await loadContentManifest(repoRoot, path.join(repoRoot, "web"));

    expect(manifest.questions).toHaveLength(10);
    expect(manifest.questions.every((question) => question.status === "verified")).toBe(
      true,
    );
  });
});
