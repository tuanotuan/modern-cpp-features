import path from "node:path";

import { findRepoRoot, loadContentManifest } from "../src/lib/content/loader";

async function main() {
  const webRoot = path.resolve(import.meta.dirname, "..");
  const repoRoot = await findRepoRoot(webRoot);
  const manifest = await loadContentManifest(repoRoot, webRoot);
  const pending = manifest.questions.filter((question) =>
    new Set(["draft", "needs_review"]).has(question.status),
  );

  if (pending.length === 0) {
    console.log("Content status: clean. No draft or stale questions.");
    return;
  }

  console.log(`Content status: ${pending.length} question(s) require review.`);
  for (const question of pending) {
    console.log(`- [${question.status}] ${question.id} (${question.lessonId})`);
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
