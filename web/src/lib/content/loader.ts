import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

import fg from "fast-glob";
import type { Heading, Root } from "mdast";
import { toString } from "mdast-util-to-string";
import remarkParse from "remark-parse";
import { unified } from "unified";
import { parse as parseYaml } from "yaml";

import {
  contentManifestSchema,
  type ContentManifest,
  type GeneratedLesson,
  lessonRegistrySchema,
  questionFileSchema,
  type Question,
} from "./schema";

const KNOWLEDGE_FILE = "knowledge.md";
const CODE_FILE = "main.cpp";

function toPosix(filePath: string) {
  return filePath.split(path.sep).join("/");
}

export function sectionIdFromHeading(heading: string) {
  const withoutNumber = heading.replace(/^\s*\d+(?:\.\d+)*\.?\s*/, "");

  return withoutNumber
    .replace(/`/g, "")
    .replace(/&/g, "")
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function exists(filePath: string) {
  try {
    await access(filePath);
    return true;
  } catch {
    return false;
  }
}

function assertInsideRepo(repoRoot: string, target: string) {
  const relative = path.relative(repoRoot, target);
  if (relative.startsWith("..") || path.isAbsolute(relative)) {
    throw new Error(`Content path escapes repository root: ${target}`);
  }
}

function assertUnique(values: string[], label: string) {
  const seen = new Set<string>();
  const duplicates = new Set<string>();

  for (const value of values) {
    if (seen.has(value)) duplicates.add(value);
    seen.add(value);
  }

  if (duplicates.size > 0) {
    throw new Error(`Duplicate ${label}: ${[...duplicates].join(", ")}`);
  }
}

export async function findRepoRoot(startDirectory = process.cwd()) {
  let candidate = path.resolve(startDirectory);

  while (true) {
    if (
      (await exists(path.join(candidate, ".git"))) &&
      (await exists(path.join(candidate, "cpp11")))
    ) {
      return candidate;
    }

    const parent = path.dirname(candidate);
    if (parent === candidate) {
      throw new Error(`Could not locate repository root from ${startDirectory}`);
    }
    candidate = parent;
  }
}

function parseSections(markdown: string) {
  const tree = unified().use(remarkParse).parse(markdown) as Root;
  const titleNode = tree.children.find(
    (node): node is Heading => node.type === "heading" && node.depth === 1,
  );

  if (!titleNode) throw new Error("knowledge.md is missing an H1 title");

  const sectionIndexes = tree.children
    .map((node, index) => ({ node, index }))
    .filter(
      (entry): entry is { node: Heading; index: number } =>
        entry.node.type === "heading" && entry.node.depth === 2,
    );

  const sections = sectionIndexes.map(({ node, index }, sectionIndex) => {
    const nextSection = sectionIndexes[sectionIndex + 1];
    const bodyNodes = tree.children.slice(index + 1, nextSection?.index);
    const bodyStart = node.position?.end.offset ?? 0;
    const bodyEnd = nextSection?.node.position?.start.offset ?? markdown.length;
    const heading = toString(node).trim();

    return {
      id: sectionIdFromHeading(heading),
      heading,
      bodyMarkdown: markdown.slice(bodyStart, bodyEnd).trim(),
      bodyText: toString({ type: "root", children: bodyNodes } as Root).trim(),
    };
  });

  assertUnique(
    sections.map((section) => section.id),
    "section IDs",
  );

  return { title: toString(titleNode).trim(), sections };
}

function extractChecklistItems(
  sections: ReturnType<typeof parseSections>["sections"],
) {
  const checklist = sections.find((section) =>
    section.id.includes("end-of-day-checklist"),
  );

  if (!checklist) return [];

  return [...checklist.bodyMarkdown.matchAll(/^\s*\d+\.\s+(.+?)\s*$/gm)].map(
    (match) => match[1].trim(),
  );
}

function sha256(...values: string[]) {
  const hash = createHash("sha256");
  for (const value of values) hash.update(value);
  return hash.digest("hex");
}

export function resolveQuestionStatus(
  status: Question["status"],
  reviewedSourceHash: string,
  currentSourceHash: string,
): Question["status"] {
  if (status === "verified" && reviewedSourceHash !== currentSourceHash) {
    return "needs_review";
  }
  return status;
}

async function loadQuestions(webRoot: string) {
  const files = await fg("content/questions/*.yaml", {
    cwd: webRoot,
    absolute: true,
    onlyFiles: true,
  });
  const questions: Question[] = [];

  for (const file of files.sort()) {
    const document = parseYaml(await readFile(file, "utf8"));
    questions.push(...questionFileSchema.parse(document).questions);
  }

  assertUnique(
    questions.map((question) => question.id),
    "question IDs",
  );
  return questions;
}

export async function loadContentManifest(
  repoRoot: string,
  webRoot = path.join(repoRoot, "web"),
): Promise<ContentManifest> {
  const registryPath = path.join(webRoot, "content", "lesson-registry.yaml");
  const registry = lessonRegistrySchema.parse(
    parseYaml(await readFile(registryPath, "utf8")),
  );

  assertUnique(
    registry.lessons.map((lesson) => lesson.id),
    "lesson IDs",
  );
  assertUnique(
    registry.lessons.map((lesson) => `${lesson.standard}:${lesson.order}`),
    "lesson order values",
  );

  const lessonIds = new Set(registry.lessons.map((lesson) => lesson.id));
  for (const lesson of registry.lessons) {
    for (const prerequisite of lesson.prerequisites) {
      if (!lessonIds.has(prerequisite)) {
        throw new Error(
          `Lesson ${lesson.id} has unknown prerequisite ${prerequisite}`,
        );
      }
    }
  }

  const lessons: GeneratedLesson[] = [];
  for (const entry of registry.lessons) {
    const sourceDirectory = path.resolve(repoRoot, entry.sourcePath);
    assertInsideRepo(repoRoot, sourceDirectory);

    const knowledgeFile = path.join(sourceDirectory, KNOWLEDGE_FILE);
    const codeFile = path.join(sourceDirectory, CODE_FILE);
    if (!(await exists(knowledgeFile))) {
      throw new Error(`Missing ${KNOWLEDGE_FILE} for ${entry.id}`);
    }

    const markdown = await readFile(knowledgeFile, "utf8");
    const code = (await exists(codeFile)) ? await readFile(codeFile, "utf8") : null;
    const parsed = parseSections(markdown);

    lessons.push({
      ...entry,
      title: parsed.title,
      knowledgePath: toPosix(path.relative(repoRoot, knowledgeFile)),
      codePath: code ? toPosix(path.relative(repoRoot, codeFile)) : null,
      sourceHash: sha256(markdown, code ?? ""),
      sections: parsed.sections,
      checklistItems: extractChecklistItems(parsed.sections),
      code,
    });
  }

  const questions = await loadQuestions(webRoot);
  const lessonById = new Map(lessons.map((lesson) => [lesson.id, lesson]));

  for (const question of questions) {
    const lesson = lessonById.get(question.lessonId);
    if (!lesson) {
      if (question.status === "archived") continue;
      throw new Error(
        `Question ${question.id} references unknown lesson ${question.lessonId}`,
      );
    }

    const sectionIds = new Set(lesson.sections.map((section) => section.id));
    for (const source of question.sources) {
      if (!sectionIds.has(source.sectionId)) {
        throw new Error(
          `Question ${question.id} references unknown section ${source.sectionId}`,
        );
      }
    }
  }

  const questionsWithReviewStatus = questions.map((question) => {
    const lesson = lessonById.get(question.lessonId);
    if (!lesson) {
      if (question.status === "archived") return question;
      throw new Error(`Missing lesson ${question.lessonId}`);
    }

    return {
      ...question,
      status: resolveQuestionStatus(
        question.status,
        question.sourceHash,
        lesson.sourceHash,
      ),
    };
  });

  return contentManifestSchema.parse({
    schemaVersion: 1,
    sourceRevision: sha256(
      ...lessons.map((lesson) => `${lesson.id}:${lesson.sourceHash}`),
    ),
    lessons,
    questions: questionsWithReviewStatus,
  });
}
