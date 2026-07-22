import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";

import { buildContentBackfillPayload } from "./backfill";
import { loadContentManifest } from "./loader";

describe("CMake content pipeline", () => {
  it("carries a CMake lesson and CMakeLists.txt into the Supabase payload", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "recall-cmake-pipeline-"));
    const webRoot = path.join(repoRoot, "web");
    const lessonRoot = path.join(repoRoot, "cmake", "01_targets");
    const questionPath = path.join(webRoot, "content", "questions", "cmake.yaml");

    try {
      await Promise.all([
        mkdir(lessonRoot, { recursive: true }),
        mkdir(path.dirname(questionPath), { recursive: true }),
      ]);
      await writeFile(
        path.join(webRoot, "content", "lesson-registry.yaml"),
        stringifyYaml({
          schemaVersion: 1,
          lessons: [
            {
              id: "cmake-targets",
              sourcePath: "cmake/01_targets",
              language: "cmake",
              track: "cmake",
              order: 1,
              tags: ["targets"],
              prerequisites: [],
            },
          ],
        }),
      );
      const knowledge = [
        "# Target-based CMake",
        "",
        "## Usage requirements",
        "",
        "Targets propagate build requirements through PUBLIC and INTERFACE links.",
        "",
      ].join("\n");
      await writeFile(path.join(lessonRoot, "knowledge.md"), knowledge);
      await writeFile(
        path.join(lessonRoot, "CMakeLists.txt"),
        "add_library(core core.cpp)\ntarget_include_directories(core PUBLIC include)\n",
      );

      const question = {
        id: "cmake-targets-001",
        lessonId: "cmake-targets",
        type: "scenario",
        responseMode: "text",
        difficulty: "intermediate",
        estimatedMinutes: 3,
        prompt: "PUBLIC usage requirements được truyền sang target phụ thuộc như thế nào?",
        hint: "Theo dõi dependency graph giữa các target.",
        answer: {
          short: "PUBLIC requirements áp dụng cho target hiện tại và consumer của nó.",
          detailed: "PUBLIC requirements vừa cấu hình target hiện tại vừa được truyền tiếp đến những target link với nó.",
        },
        rubric: {
          required: ["Phân biệt yêu cầu của target và consumer"],
          bonus: [],
          misconceptions: [],
        },
        sources: [{ sectionId: "usage-requirements" }],
        sourceHash: "0".repeat(64),
        status: "draft",
        version: 1,
      };
      await writeFile(
        questionPath,
        stringifyYaml({ schemaVersion: 1, questions: [question] }),
      );

      const initial = await loadContentManifest(repoRoot, webRoot);
      question.sourceHash = initial.lessons[0].sourceHash;
      await writeFile(
        questionPath,
        stringifyYaml({ schemaVersion: 1, questions: [question] }),
      );
      const manifest = await loadContentManifest(repoRoot, webRoot);
      const payload = buildContentBackfillPayload({
        manifest,
        sourceCommitSha: "a".repeat(40),
        knowledgeMarkdownByLessonId: new Map([
          ["cmake-targets", await readFile(path.join(lessonRoot, "knowledge.md"), "utf8")],
        ]),
        rawQuestionMetadataById: new Map([
          [
            "cmake-targets-001",
            { origin: "generated" as const, lifecycleStatus: "draft" as const },
          ],
        ]),
      });

      expect(manifest.lessons[0]).toMatchObject({
        language: "cmake",
        track: "cmake",
        standard: "cmake",
        codePath: "cmake/01_targets/CMakeLists.txt",
      });
      expect(manifest.questions[0].taxonomy).toMatchObject({
        deckId: "cmake-build-systems",
        language: "cmake",
        track: "cmake",
        standard: "cmake",
      });
      expect(payload.expected).toMatchObject({ lessons: 1, questions: 1 });
      expect(payload.lessons[0].code).toContain("target_include_directories");
      expect(payload.questions[0].base.taxonomy.tags).toContain(
        "deck::cmake-build-systems",
      );
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
