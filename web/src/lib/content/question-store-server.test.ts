import { beforeAll, describe, expect, it, vi } from "vitest";

import type { ContentManifest } from "./schema";

vi.mock("server-only", () => ({}));

let compareContentManifests: typeof import("./question-store-server")["compareContentManifests"];
let rowsToContentManifest: typeof import("./question-store-server")["rowsToContentManifest"];

beforeAll(async () => {
  ({ compareContentManifests, rowsToContentManifest } = await import(
    "./question-store-server"
  ));
});

const hash = "a".repeat(64);

function buildDatabaseManifest(): ContentManifest {
  return rowsToContentManifest(
    [
      {
        id: "cpp11-example",
        lifecycle_status: "active",
        source_hash: hash,
        source_commit_sha: "b".repeat(40),
        source_path: "cpp11/01_example",
        language: "cpp",
        track: "cpp11",
        standard: "cpp11",
        lesson_order: 1,
        title: "Example",
        tags: ["example"],
        prerequisites: [],
        code: "",
        sections: [
          {
            id: "overview",
            heading: "Overview",
            bodyMarkdown: "Body",
            bodyText: "Body",
          },
        ],
        checklist_items: ["Know the rule"],
        manifest_order: 1,
      },
      {
        id: "cpp98-archived",
        lifecycle_status: "archived",
        source_hash: hash,
        source_commit_sha: null,
        source_path: "cpp98/99_archived",
        language: "cpp",
        track: "cpp98",
        standard: "cpp98",
        lesson_order: 99,
        title: "Archived",
        tags: ["archived"],
        prerequisites: [],
        code: null,
        sections: [
          {
            id: "overview",
            heading: "Overview",
            bodyMarkdown: "Archived body",
            bodyText: "Archived body",
          },
        ],
        checklist_items: [],
        manifest_order: 2,
      },
    ],
    [
      {
        id: "cpp11-example-001",
        lesson_id: "cpp11-example",
        version: 1,
        type: "recall",
        response_mode: "text",
        difficulty: "beginner",
        estimated_minutes: 2,
        prompt: "Explain this example in an interview.",
        code: null,
        hint: "Start with the core rule.",
        answer: {
          short: "A sufficiently long short answer.",
          detailed: "A sufficiently detailed canonical explanation.",
        },
        rubric: {
          required: ["States the main rule"],
          bonus: [],
          misconceptions: [],
        },
        sources: [{ sectionId: "overview" }],
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
        source_hash: hash,
        status: "verified",
        manifest_order: 1,
      },
      {
        id: "cpp98-archived-001",
        lesson_id: "cpp98-archived",
        version: 1,
        type: "recall",
        response_mode: "text",
        difficulty: "beginner",
        estimated_minutes: 2,
        prompt: "This question belongs to an archived lesson.",
        code: null,
        hint: "It must not be served.",
        answer: {
          short: "This archived answer is long enough.",
          detailed: "This archived detailed answer is sufficiently long.",
        },
        rubric: {
          required: ["Recognizes the archived lesson"],
          bonus: [],
          misconceptions: [],
        },
        sources: [{ sectionId: "overview" }],
        taxonomy: {
          deckId: "cpp-interview",
          standard: "cpp98",
          topics: ["archived"],
          skill: "recall",
          difficulty: "beginner",
          responseMode: "text",
          sourceLessonId: "cpp98-archived",
          tags: [
            "deck::cpp-interview",
            "standard::cpp98",
            "topic::archived",
            "skill::recall",
            "difficulty::beginner",
            "response::text",
            "source::cpp98-archived",
          ],
        },
        source_hash: hash,
        status: "archived",
        manifest_order: 2,
      },
    ],
    "c".repeat(64),
  );
}

describe("Supabase question store", () => {
  it("materializes active lesson and question rows into the app manifest", () => {
    const manifest = buildDatabaseManifest();

    expect(manifest.lessons).toHaveLength(1);
    expect(manifest.sourceRevision).toBe("c".repeat(64));
    expect(manifest.lessons[0]).toMatchObject({
      id: "cpp11-example",
      knowledgePath: "cpp11/01_example/knowledge.md",
      codePath: null,
      code: "",
    });
    expect(manifest.questions[0]).toMatchObject({
      id: "cpp11-example-001",
      responseMode: "text",
      sourceHash: hash,
    });
    expect(manifest.questions).toHaveLength(1);
  });

  it("reports exact IDs whose content diverges", () => {
    const repository = buildDatabaseManifest();
    const matching = compareContentManifests(repository, structuredClone(repository));
    expect(matching.ok).toBe(true);
    expect(matching.readyForCutover).toBe(true);

    const database = structuredClone(repository);
    database.questions[0].prompt = "A changed prompt that is still long enough.";
    const mismatch = compareContentManifests(repository, database);

    expect(mismatch.ok).toBe(false);
    expect(mismatch.readyForCutover).toBe(false);
    expect(mismatch.mismatchedQuestionIds).toEqual(["cpp11-example-001"]);
  });
});
