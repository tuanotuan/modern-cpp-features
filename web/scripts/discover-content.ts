import path from "node:path";

import { parse as parseYaml } from "yaml";
import { readFile } from "node:fs/promises";

import {
  archiveQuestionsForLessons,
  discoverKnowledgeDirectories,
  mergeDiscoveredLessons,
  writeContentManifest,
  writeLessonRegistry,
} from "../src/lib/content/automation";
import { findRepoRoot } from "../src/lib/content/loader";
import { lessonRegistrySchema } from "../src/lib/content/schema";

async function main() {
  const webRoot = path.resolve(import.meta.dirname, "..");
  const repoRoot = await findRepoRoot(webRoot);
  const registryPath = path.join(webRoot, "content", "lesson-registry.yaml");
  const registry = lessonRegistrySchema.parse(
    parseYaml(await readFile(registryPath, "utf8")),
  );
  const sourcePaths = await discoverKnowledgeDirectories(repoRoot);
  const result = mergeDiscoveredLessons(registry, sourcePaths);

  if (
    result.additions.length ||
    result.removals.length ||
    result.moves.length
  ) {
    await writeLessonRegistry(webRoot, result.registry);
  }
  if (result.additions.length === 0) {
    console.log("No unregistered lessons found.");
  } else {
    console.log(`Registered ${result.additions.length} new lesson(s):`);
    for (const lesson of result.additions) {
      console.log(`- ${lesson.id} <- ${lesson.sourcePath}`);
    }
  }
  for (const move of result.moves) {
    console.log(`Moved ${move.id}: ${move.from} -> ${move.to}`);
  }
  if (result.removals.length) {
    const archived = await archiveQuestionsForLessons(
      webRoot,
      result.removals.map((lesson) => lesson.id),
    );
    console.log(
      `Removed ${result.removals.length} lesson(s) and archived ${archived.length} question(s).`,
    );
  }

  const manifest = await writeContentManifest(repoRoot, webRoot);
  const stale = manifest.questions.filter(
    (question) => question.status === "needs_review",
  );
  console.log(
    `Manifest refreshed: ${manifest.lessons.length} lessons, ${stale.length} question(s) need review.`,
  );
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
