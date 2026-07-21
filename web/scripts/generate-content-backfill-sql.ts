import { execFileSync } from "node:child_process";
import { readFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";
import { parse as parseYaml } from "yaml";

import manifestJson from "../src/generated/content-manifest.json";
import {
  buildContentBackfillPayload,
  renderContentBackfillSql,
  type RawQuestionMetadata,
} from "../src/lib/content/backfill";
import { findRepoRoot } from "../src/lib/content/loader";
import {
  contentManifestSchema,
  questionFileSchema,
} from "../src/lib/content/schema";

async function main() {
  const webRoot = path.resolve(import.meta.dirname, "..");
  const repoRoot = await findRepoRoot(webRoot);
  const manifest = contentManifestSchema.parse(manifestJson);
  const sourceCommitSha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: repoRoot,
    encoding: "utf8",
  }).trim();
  const knowledgeMarkdownByLessonId = new Map<string, string>();
  for (const lesson of manifest.lessons) {
    knowledgeMarkdownByLessonId.set(
      lesson.id,
      await readFile(path.join(repoRoot, lesson.knowledgePath), "utf8"),
    );
  }
  const rawQuestionMetadataById = new Map<string, RawQuestionMetadata>();
  const questionFiles = await fg("content/questions/*.yaml", {
    cwd: webRoot,
    absolute: true,
  });
  for (const questionFile of questionFiles.sort()) {
    const document = questionFileSchema.parse(
      parseYaml(await readFile(questionFile, "utf8")),
    );
    const origin = path.basename(questionFile) === "pilot.yaml" ? "pilot" : "generated";
    for (const question of document.questions) {
      if (rawQuestionMetadataById.has(question.id)) {
        throw new Error(`Duplicate question ID ${question.id}`);
      }
      rawQuestionMetadataById.set(question.id, {
        origin,
        lifecycleStatus:
          question.status === "verified"
            ? "verified"
            : question.status === "archived"
              ? "archived"
              : "draft",
      });
    }
  }
  const payload = buildContentBackfillPayload({
    manifest,
    sourceCommitSha,
    knowledgeMarkdownByLessonId,
    rawQuestionMetadataById,
  });

  if (process.argv.includes("--check")) {
    process.stdout.write(
      `${JSON.stringify({
        sourceCommitSha: payload.sourceCommitSha,
        lessons: payload.expected.lessons,
        questions: payload.expected.questions,
        payloadChecksum: payload.expected.payloadChecksum,
      })}\n`,
    );
    return;
  }

  process.stdout.write(`${renderContentBackfillSql(payload)}\n`);
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
