import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  findRepoRoot,
  loadContentManifest,
  resolveQuestionStatus,
  sectionIdFromHeading,
} from "./loader";

describe("content loader", () => {
  it("normalizes numbered Markdown headings", () => {
    expect(sectionIdFromHeading("4. `const` vs `constexpr`")).toBe(
      "const-vs-constexpr",
    );
  });

  it("marks a verified question for review when its source changes", () => {
    expect(resolveQuestionStatus("verified", "old", "new")).toBe(
      "needs_review",
    );
    expect(resolveQuestionStatus("verified", "same", "same")).toBe(
      "verified",
    );
    expect(resolveQuestionStatus("draft", "old", "new")).toBe("draft");
  });

  it("imports the current repository corpus", async () => {
    const repoRoot = await findRepoRoot(import.meta.dirname);
    const manifest = await loadContentManifest(repoRoot, path.join(repoRoot, "web"));

    expect(manifest.lessons.length).toBeGreaterThan(0);
    expect(manifest.lessons.every((lesson) => lesson.codePath !== null)).toBe(true);
    expect(
      manifest.lessons.reduce(
        (total, lesson) => total + lesson.checklistItems.length,
        0,
      ),
    ).toBeGreaterThan(0);
  });

  it("validates the question bank and keeps drafts out of the verified set", async () => {
    const repoRoot = await findRepoRoot(import.meta.dirname);
    const manifest = await loadContentManifest(repoRoot, path.join(repoRoot, "web"));

    const verified = manifest.questions.filter(
      (question) => question.status === "verified",
    );
    const drafts = manifest.questions.filter(
      (question) => question.status === "draft",
    );

    expect(verified.length).toBeGreaterThan(0);
    expect(drafts.length).toBeGreaterThan(0);
    const verifiedIds = new Set(verified.map((question) => question.id));
    expect(drafts.every((question) => !verifiedIds.has(question.id))).toBe(true);
  });
});
