import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { loadEnvConfig } from "@next/env";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { writeContentManifest } from "../src/lib/content/automation";
import {
  generateQuestionDraftsWithOpenAI,
  nextQuestionIds,
} from "../src/lib/content/drafts";
import { findRepoRoot, loadContentManifest } from "../src/lib/content/loader";
import {
  questionFileSchema,
  type Question,
} from "../src/lib/content/schema";

async function main() {
  const lessonId = argumentValue("--lesson");
  if (!lessonId) {
    throw new Error(
      "Usage: npm run content:draft -- --lesson <lesson-id> [--count 3]",
    );
  }
  const count = Number(argumentValue("--count") ?? "3");
  if (!Number.isInteger(count) || count < 1 || count > 5) {
    throw new Error("--count must be an integer from 1 to 5");
  }

  const webRoot = path.resolve(import.meta.dirname, "..");
  loadEnvConfig(webRoot);
  const repoRoot = await findRepoRoot(webRoot);
  const manifest = await loadContentManifest(repoRoot, webRoot);
  const lesson = manifest.lessons.find((item) => item.id === lessonId);
  if (!lesson) throw new Error(`Unknown lesson: ${lessonId}`);

  console.log(`Generating ${count} draft(s) for ${lesson.id} with OpenAI Luna...`);
  const generated = await generateQuestionDraftsWithOpenAI({ lesson, count });
  const ids = nextQuestionIds(
    lesson.id,
    manifest.questions.map((question) => question.id),
    count,
  );
  const drafts: Question[] = generated.map((question, index) => ({
    ...question,
    code: question.code ?? undefined,
    id: ids[index],
    lessonId: lesson.id,
    sourceHash: lesson.sourceHash,
    status: "draft",
    version: 1,
  }));

  const outputPath = path.join(webRoot, "content", "questions", "generated.yaml");
  let existing: Question[] = [];
  try {
    const document = parseYaml(await readFile(outputPath, "utf8"));
    existing = questionFileSchema.parse(document).questions;
  } catch (error) {
    const nodeError = error as NodeJS.ErrnoException;
    if (nodeError.code !== "ENOENT") throw error;
  }

  const document = questionFileSchema.parse({
    schemaVersion: 1,
    questions: [...existing, ...drafts],
  });
  await writeFile(outputPath, stringifyYaml(document, { lineWidth: 100 }));
  await writeContentManifest(repoRoot, webRoot);

  console.log(`Saved ${drafts.length} draft(s) to content/questions/generated.yaml:`);
  for (const draft of drafts) console.log(`- ${draft.id}`);
  console.log("Review the YAML, then approve with content:review.");
}

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
