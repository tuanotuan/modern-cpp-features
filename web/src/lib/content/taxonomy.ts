import type {
  GeneratedLesson,
  Question,
  QuestionTaxonomy,
} from "./schema";

export const HOME_DECK_ID = "cpp-interview" as const;
export const PYTHON_DECK_ID = "python-interview" as const;
export const CMAKE_DECK_ID = "cmake-build-systems" as const;

export function buildQuestionTaxonomy(
  question: Question,
  lesson: Pick<
    GeneratedLesson,
    "id" | "language" | "track" | "standard" | "tags"
  >,
): QuestionTaxonomy {
  if (question.lessonId !== lesson.id) {
    throw new Error(
      `Question ${question.id} belongs to ${question.lessonId}, not ${lesson.id}`,
    );
  }

  const topics = [...new Set(lesson.tags)].sort();
  const responseMode = question.responseMode ?? "text";
  const deckId = lesson.language === "python"
    ? PYTHON_DECK_ID
    : lesson.language === "cmake"
      ? CMAKE_DECK_ID
      : HOME_DECK_ID;
  const tags = [
    `deck::${deckId}`,
    `standard::${lesson.standard}`,
    ...topics.map((topic) => `topic::${topic}`),
    `skill::${canonicalTagValue(question.type)}`,
    `difficulty::${question.difficulty}`,
    `response::${responseMode}`,
    `source::${lesson.id}`,
  ];

  const shared = {
    deckId,
    standard: lesson.standard,
    topics,
    skill: question.type,
    difficulty: question.difficulty,
    responseMode,
    sourceLessonId: lesson.id,
    tags: [...new Set(tags)],
  };
  if (lesson.language === "cpp") return shared;

  return {
    ...shared,
    language: lesson.language,
    track: lesson.track,
    tags: [
      ...new Set([
        ...shared.tags,
        `language::${lesson.language}`,
        `track::${lesson.track}`,
      ]),
    ],
  };
}

function canonicalTagValue(value: string) {
  return value.replaceAll("_", "-");
}
