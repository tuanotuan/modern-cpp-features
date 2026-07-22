import { mkdtemp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";
import { stringify as stringifyYaml } from "yaml";

import { buildContentBackfillPayload } from "./backfill";
import { loadContentManifest } from "./loader";

describe("Python content pipeline", () => {
  it("carries one Python lesson from repository files into the Supabase payload", async () => {
    const repoRoot = await mkdtemp(path.join(tmpdir(), "recall-python-pipeline-"));
    const webRoot = path.join(repoRoot, "web");
    const lessonRoot = path.join(repoRoot, "python", "01_generators");
    const questionPath = path.join(webRoot, "content", "questions", "python.yaml");

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
              id: "python-generators",
              sourcePath: "python/01_generators",
              language: "python",
              track: "python3",
              order: 1,
              tags: ["generators"],
              prerequisites: [],
            },
          ],
        }),
      );
      const knowledge = [
        "# Python generators",
        "",
        "## Iterator protocol",
        "",
        "A generator yields values lazily and keeps its suspended state.",
        "",
      ].join("\n");
      await writeFile(path.join(lessonRoot, "knowledge.md"), knowledge);
      await writeFile(
        path.join(lessonRoot, "main.py"),
        "def values():\n    yield 1\n",
      );

      const question = {
        id: "python-generators-001",
        lessonId: "python-generators",
        type: "recall",
        responseMode: "text",
        difficulty: "beginner",
        estimatedMinutes: 2,
        prompt: "Generator giữ trạng thái và tạo giá trị như thế nào?",
        hint: "Nghĩ về yield và lazy evaluation.",
        answer: {
          short: "Generator tạm dừng tại yield và tiếp tục khi được yêu cầu.",
          detailed: "Generator tạo giá trị theo nhu cầu, giữ trạng thái thực thi giữa các lần gọi và tiếp tục sau yield.",
        },
        rubric: {
          required: ["Nêu được lazy evaluation và trạng thái tạm dừng"],
          bonus: [],
          misconceptions: [],
        },
        sources: [{ sectionId: "iterator-protocol" }],
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
          ["python-generators", await readFile(path.join(lessonRoot, "knowledge.md"), "utf8")],
        ]),
        rawQuestionMetadataById: new Map([
          [
            "python-generators-001",
            {
              origin: "generated" as const,
              lifecycleStatus: "draft" as const,
            },
          ],
        ]),
      });

      expect(manifest.lessons[0]).toMatchObject({
        language: "python",
        track: "python3",
        standard: "python3",
        codePath: "python/01_generators/main.py",
      });
      expect(manifest.questions[0].taxonomy).toMatchObject({
        deckId: "python-interview",
        language: "python",
        track: "python3",
        standard: "python3",
      });
      expect(payload.expected).toMatchObject({ lessons: 1, questions: 1 });
      expect(payload.lessons[0].code).toContain("yield 1");
      expect(payload.questions[0].base.taxonomy.tags).toContain(
        "deck::python-interview",
      );
      expect(payload.questions[0].contentChecksum).toMatch(/^[a-f0-9]{64}$/);
    } finally {
      await rm(repoRoot, { recursive: true, force: true });
    }
  });
});
