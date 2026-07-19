import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import {
  approveQuestion,
  writeContentManifest,
} from "../src/lib/content/automation";
import { findRepoRoot, loadContentManifest } from "../src/lib/content/loader";
import { questionFileSchema } from "../src/lib/content/schema";

async function main() {
  const questionId = argumentValue("--id");
  if (!questionId) {
    throw new Error("Usage: npm run content:review -- --id <question-id>");
  }

  const webRoot = path.resolve(import.meta.dirname, "..");
  const repoRoot = await findRepoRoot(webRoot);
  const manifest = await loadContentManifest(repoRoot, webRoot);
  const effectiveQuestion = manifest.questions.find(
    (question) => question.id === questionId,
  );
  if (!effectiveQuestion) throw new Error(`Unknown question: ${questionId}`);
  if (!new Set(["draft", "needs_review"]).has(effectiveQuestion.status)) {
    throw new Error(
      `Question ${questionId} is ${effectiveQuestion.status}; only draft or needs_review can be approved.`,
    );
  }

  const lesson = manifest.lessons.find(
    (item) => item.id === effectiveQuestion.lessonId,
  );
  if (!lesson) throw new Error(`Missing lesson ${effectiveQuestion.lessonId}`);

  const files = await fg("content/questions/*.yaml", {
    cwd: webRoot,
    absolute: true,
    onlyFiles: true,
  });
  for (const file of files.sort()) {
    const document = questionFileSchema.parse(
      parseYaml(await readFile(file, "utf8")),
    );
    const index = document.questions.findIndex(
      (question) => question.id === questionId,
    );
    if (index < 0) continue;

    document.questions[index] = approveQuestion(
      document.questions[index],
      lesson.sourceHash,
    );
    await writeFile(file, stringifyYaml(document, { lineWidth: 100 }));
    await writeContentManifest(repoRoot, webRoot);
    console.log(
      `Approved ${questionId} as v${document.questions[index].version} in ${path.relative(webRoot, file)}.`,
    );
    return;
  }

  throw new Error(`Question ${questionId} was not found in a YAML source file`);
}

function argumentValue(name: string) {
  const index = process.argv.indexOf(name);
  return index >= 0 ? process.argv[index + 1] : undefined;
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
