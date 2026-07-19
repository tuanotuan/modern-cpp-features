import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import { findRepoRoot, loadContentManifest } from "../src/lib/content/loader";

async function main() {
  const webRoot = path.resolve(import.meta.dirname, "..");
  const repoRoot = await findRepoRoot(webRoot);
  const outputPath = path.join(
    webRoot,
    "src",
    "generated",
    "content-manifest.json",
  );
  const manifest = await loadContentManifest(repoRoot, webRoot);
  const serialized = `${JSON.stringify(manifest, null, 2)}\n`;

  if (process.argv.includes("--check")) {
    let current = "";
    try {
      current = await readFile(outputPath, "utf8");
    } catch {
      // The actionable error below also covers a missing manifest.
    }

    if (current !== serialized) {
      console.error("Content manifest is stale. Run: npm run content:generate");
      process.exitCode = 1;
    } else {
      console.log("Content manifest is up to date.");
    }
  } else {
    await mkdir(path.dirname(outputPath), { recursive: true });
    await writeFile(outputPath, serialized, "utf8");
    console.log(`Generated ${path.relative(repoRoot, outputPath)}`);
  }
}

void main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
