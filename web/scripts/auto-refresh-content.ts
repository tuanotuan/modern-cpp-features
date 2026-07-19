import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  archiveQuestionsForLessons,
  discoverKnowledgeDirectories,
  mergeDiscoveredLessons,
  writeContentManifest,
  writeLessonRegistry,
} from "../src/lib/content/automation";
import {
  generateQuestionDraftsWithGemini,
  nextQuestionIds,
} from "../src/lib/content/drafts";
import { findRepoRoot, loadContentManifest } from "../src/lib/content/loader";
import {
  contentManifestSchema,
  lessonRegistrySchema,
  questionFileSchema,
  type Question,
} from "../src/lib/content/schema";

const DRAFTS_PER_CHANGED_LESSON = 2;

async function main() {
  const webRoot = path.resolve(import.meta.dirname, "..");
  loadEnvConfig(webRoot);
  const repoRoot = await findRepoRoot(webRoot);
  const previousManifest = contentManifestSchema.parse(
    JSON.parse(
      await readFile(
        path.join(webRoot, "src", "generated", "content-manifest.json"),
        "utf8",
      ),
    ),
  );
  const registryPath = path.join(webRoot, "content", "lesson-registry.yaml");
  const registry = lessonRegistrySchema.parse(
    parseYaml(await readFile(registryPath, "utf8")),
  );
  const sourcePaths = await discoverKnowledgeDirectories(repoRoot);
  const reconciliation = mergeDiscoveredLessons(registry, sourcePaths);

  if (
    reconciliation.additions.length ||
    reconciliation.removals.length ||
    reconciliation.moves.length
  ) {
    await writeLessonRegistry(webRoot, reconciliation.registry);
  }
  const archived = await archiveQuestionsForLessons(
    webRoot,
    reconciliation.removals.map((lesson) => lesson.id),
  );
  const liveManifest = await loadContentManifest(repoRoot, webRoot);
  const previousHashByLesson = new Map(
    previousManifest.lessons.map((lesson) => [lesson.id, lesson.sourceHash]),
  );
  const changedLessons = liveManifest.lessons.filter(
    (lesson) => previousHashByLesson.get(lesson.id) !== lesson.sourceHash,
  );

  const generatedPath = path.join(
    webRoot,
    "content",
    "questions",
    "generated.yaml",
  );
  let generatedQuestions: Question[] = [];
  try {
    generatedQuestions = questionFileSchema.parse(
      parseYaml(await readFile(generatedPath, "utf8")),
    ).questions;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") throw error;
  }

  const allQuestionIds = liveManifest.questions.map((question) => question.id);
  const created: Question[] = [];
  for (const lesson of changedLessons) {
    const alreadyGrounded = liveManifest.questions.some(
      (question) =>
        question.lessonId === lesson.id &&
        question.sourceHash === lesson.sourceHash &&
        question.status !== "archived",
    );
    if (alreadyGrounded) continue;

    console.log(`Generating safe drafts for changed lesson ${lesson.id}...`);
    const aiDrafts = await generateQuestionDraftsWithGemini({
      lesson,
      count: DRAFTS_PER_CHANGED_LESSON,
    });
    const ids = nextQuestionIds(
      lesson.id,
      [...allQuestionIds, ...created.map((question) => question.id)],
      aiDrafts.length,
    );
    created.push(
      ...aiDrafts.map((question, index): Question => ({
        ...question,
        code: question.code ?? undefined,
        id: ids[index],
        lessonId: lesson.id,
        sourceHash: lesson.sourceHash,
        status: "draft",
        version: 1,
      })),
    );
  }

  if (created.length) {
    const document = questionFileSchema.parse({
      schemaVersion: 1,
      questions: [...generatedQuestions, ...created],
    });
    await writeFile(generatedPath, stringifyYaml(document, { lineWidth: 100 }));
  }
  const finalManifest = await writeContentManifest(repoRoot, webRoot);
  console.log(
    `Auto refresh complete: +${reconciliation.additions.length} lessons, -${reconciliation.removals.length} lessons, ${archived.length} archived questions, ${created.length} new drafts, ${finalManifest.questions.filter((question) => question.status === "needs_review").length} stale questions.`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
