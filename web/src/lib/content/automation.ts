import { readFile, writeFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";
import { parse as parseYaml, stringify as stringifyYaml } from "yaml";

import { loadContentManifest, sectionIdFromHeading } from "./loader";
import type {
  ContentManifest,
  LessonRegistry,
  LessonRegistryEntry,
  Question,
} from "./schema";
import { questionFileSchema } from "./schema";

const SOURCE_ROOTS = {
  cpp98_foundation: { language: "cpp", track: "cpp98", idPrefix: "cpp98" },
  cpp11: { language: "cpp", track: "cpp11", idPrefix: "cpp11" },
  cpp20: { language: "cpp", track: "cpp20", idPrefix: "cpp20" },
  python: { language: "python", track: "python3", idPrefix: "python" },
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
): {
  registry: LessonRegistry;
  additions: LessonRegistryEntry[];
  removals: LessonRegistryEntry[];
  moves: Array<{ id: string; from: string; to: string }>;
} {
  const discoveredPaths = new Set(sourcePaths.map(normalizeSourcePath));
  const knownPaths = new Set(
    registry.lessons.map((lesson) => normalizeSourcePath(lesson.sourcePath)),
  );
  const knownIds = new Set(registry.lessons.map((lesson) => lesson.id));
  const missing = new Map(
    registry.lessons
      .filter(
        (lesson) =>
          isManagedSourcePath(lesson.sourcePath) &&
          !discoveredPaths.has(normalizeSourcePath(lesson.sourcePath)),
      )
      .map((lesson) => [lesson.id, lesson]),
  );
  const nextOrder = new Map<string, number>();

  for (const source of Object.values(SOURCE_ROOTS)) {
    const highest = Math.max(
      0,
      ...registry.lessons
        .filter((lesson) => lesson.track === source.track)
        .map((lesson) => lesson.order),
    );
    nextOrder.set(source.track, highest + 1);
  }

  const additions: LessonRegistryEntry[] = [];
  const moves: Array<{ id: string; from: string; to: string }> = [];
  for (const rawSourcePath of [...new Set(sourcePaths.map(normalizeSourcePath))].sort()) {
    if (knownPaths.has(rawSourcePath)) continue;

    const [root, ...relativeParts] = rawSourcePath.split("/");
    const source = SOURCE_ROOTS[root as keyof typeof SOURCE_ROOTS];
    if (!source || relativeParts.length === 0) continue;

    const topic = relativeParts
      .join("-")
      .replace(/(^|-)\d+[_\s-]*/g, "$1");
    const slug = sectionIdFromHeading(topic);
    if (!slug) throw new Error(`Cannot derive lesson ID from ${rawSourcePath}`);

    const id = `${source.idPrefix}-${slug}`;
    if (knownIds.has(id)) {
      const movedLesson = missing.get(id);
      if (movedLesson) {
        moves.push({ id, from: movedLesson.sourcePath, to: rawSourcePath });
        missing.delete(id);
        knownPaths.add(rawSourcePath);
        continue;
      }
      throw new Error(
        `Discovered lesson ID ${id} collides with an existing lesson; register ${rawSourcePath} manually.`,
      );
    }

    const entry: LessonRegistryEntry = {
      id,
      sourcePath: rawSourcePath,
      language: source.language,
      track: source.track,
      standard: source.track,
      order: nextOrder.get(source.track) ?? 1,
      tags: slug.split("-").filter(Boolean),
      prerequisites: [],
    };
    nextOrder.set(source.track, entry.order + 1);
    additions.push(entry);
    knownPaths.add(rawSourcePath);
    knownIds.add(id);
  }

  const removals = [...missing.values()];
  const removedIds = new Set(removals.map((lesson) => lesson.id));
  const moveById = new Map(moves.map((move) => [move.id, move]));

  return {
    registry: {
      ...registry,
      lessons: [
        ...registry.lessons
          .filter((lesson) => !removedIds.has(lesson.id))
          .map((lesson) => {
            const move = moveById.get(lesson.id);
            return move ? { ...lesson, sourcePath: move.to } : lesson;
          }),
        ...additions,
      ],
    },
    additions,
    removals,
    moves,
  };
}

export async function archiveQuestionsForLessons(
  webRoot: string,
  lessonIds: string[],
) {
  const removed = new Set(lessonIds);
  if (!removed.size) return [];

  const archivedIds: string[] = [];
  const files = await fg("content/questions/*.yaml", {
    cwd: webRoot,
    absolute: true,
    onlyFiles: true,
  });
  for (const file of files.sort()) {
    const document = questionFileSchema.parse(
      parseYaml(await readFile(file, "utf8")),
    );
    let changed = false;
    document.questions = document.questions.map((question) => {
      if (!removed.has(question.lessonId) || question.status === "archived") {
        return question;
      }
      changed = true;
      archivedIds.push(question.id);
      return { ...question, status: "archived", version: question.version + 1 };
    });
    if (changed) {
      await writeFile(file, stringifyYaml(document, { lineWidth: 100 }));
    }
  }
  return archivedIds;
}

export async function writeLessonRegistry(
  webRoot: string,
  registry: LessonRegistry,
) {
  const output = stringifyYaml(
    {
      ...registry,
      lessons: registry.lessons.map((lesson) =>
        Object.fromEntries(
          Object.entries(lesson).filter(([key]) => key !== "standard"),
        )
      ),
    },
    { lineWidth: 100 },
  );
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

function isManagedSourcePath(sourcePath: string) {
  const [root] = normalizeSourcePath(sourcePath).split("/");
  return root in SOURCE_ROOTS;
}
