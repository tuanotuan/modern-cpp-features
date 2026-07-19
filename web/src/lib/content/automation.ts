import { writeFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";
import { stringify as stringifyYaml } from "yaml";

import { loadContentManifest, sectionIdFromHeading } from "./loader";
import type {
  ContentManifest,
  LessonRegistry,
  LessonRegistryEntry,
  Question,
} from "./schema";

const SOURCE_ROOTS = {
  cpp98_foundation: "cpp98",
  cpp11: "cpp11",
  cpp20: "cpp20",
} as const;

export async function discoverKnowledgeDirectories(repoRoot: string) {
  const files = await fg(
    Object.keys(SOURCE_ROOTS).map((root) => `${root}/**/knowledge.md`),
    { cwd: repoRoot, onlyFiles: true },
  );

  return files.map((file) => path.posix.dirname(file)).sort();
}

export function mergeDiscoveredLessons(
  registry: LessonRegistry,
  sourcePaths: string[],
): { registry: LessonRegistry; additions: LessonRegistryEntry[] } {
  const knownPaths = new Set(
    registry.lessons.map((lesson) => normalizeSourcePath(lesson.sourcePath)),
  );
  const knownIds = new Set(registry.lessons.map((lesson) => lesson.id));
  const nextOrder = new Map<string, number>();

  for (const standard of Object.values(SOURCE_ROOTS)) {
    const highest = Math.max(
      0,
      ...registry.lessons
        .filter((lesson) => lesson.standard === standard)
        .map((lesson) => lesson.order),
    );
    nextOrder.set(standard, highest + 1);
  }

  const additions: LessonRegistryEntry[] = [];
  for (const rawSourcePath of [...new Set(sourcePaths.map(normalizeSourcePath))].sort()) {
    if (knownPaths.has(rawSourcePath)) continue;

    const [root, ...relativeParts] = rawSourcePath.split("/");
    const standard = SOURCE_ROOTS[root as keyof typeof SOURCE_ROOTS];
    if (!standard || relativeParts.length === 0) continue;

    const topic = relativeParts
      .join("-")
      .replace(/(^|-)\d+[_\s-]*/g, "$1");
    const slug = sectionIdFromHeading(topic);
    if (!slug) throw new Error(`Cannot derive lesson ID from ${rawSourcePath}`);

    const id = `${standard}-${slug}`;
    if (knownIds.has(id)) {
      throw new Error(
        `Discovered lesson ID ${id} collides with an existing lesson; register ${rawSourcePath} manually.`,
      );
    }

    const entry: LessonRegistryEntry = {
      id,
      sourcePath: rawSourcePath,
      standard,
      order: nextOrder.get(standard) ?? 1,
      tags: slug.split("-").filter(Boolean),
      prerequisites: [],
    };
    nextOrder.set(standard, entry.order + 1);
    additions.push(entry);
    knownPaths.add(rawSourcePath);
    knownIds.add(id);
  }

  return {
    registry: {
      ...registry,
      lessons: [...registry.lessons, ...additions],
    },
    additions,
  };
}

export async function writeLessonRegistry(
  webRoot: string,
  registry: LessonRegistry,
) {
  const output = stringifyYaml(registry, { lineWidth: 100 });
  await writeFile(path.join(webRoot, "content", "lesson-registry.yaml"), output);
}

export async function writeContentManifest(
  repoRoot: string,
  webRoot: string,
): Promise<ContentManifest> {
  const manifest = await loadContentManifest(repoRoot, webRoot);
  const outputPath = path.join(webRoot, "src", "generated", "content-manifest.json");
  await writeFile(outputPath, `${JSON.stringify(manifest, null, 2)}\n`);
  return manifest;
}

export function approveQuestion(
  question: Question,
  currentSourceHash: string,
): Question {
  if (question.status === "archived") {
    throw new Error(`Archived question ${question.id} cannot be approved`);
  }

  return {
    ...question,
    sourceHash: currentSourceHash,
    status: "verified",
    version: question.status === "draft" ? question.version : question.version + 1,
  };
}

function normalizeSourcePath(sourcePath: string) {
  return sourcePath.replaceAll("\\", "/").replace(/^\.\//, "").replace(/\/$/, "");
}
