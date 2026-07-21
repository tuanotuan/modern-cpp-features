import type {
  GeneratedLesson,
  Question,
  QuestionTaxonomy,
} from "./schema";

export const HOME_DECK_ID = "cpp-interview" as const;

export function buildQuestionTaxonomy(
  question: Question,
  lesson: Pick<GeneratedLesson, "id" | "standard" | "tags">,
): QuestionTaxonomy {
  if (question.lessonId !== lesson.id) {
    throw new Error(
      `Question ${question.id} belongs to ${question.lessonId}, not ${lesson.id}`,
    );
  }

  const topics = [...new Set(lesson.tags)].sort();
  const responseMode = question.responseMode ?? "text";
  const tags = [
    `deck::${HOME_DECK_ID}`,
    `standard::${lesson.standard}`,
    ...topics.map((topic) => `topic::${topic}`),
    `skill::${canonicalTagValue(question.type)}`,
    `difficulty::${question.difficulty}`,
    `response::${responseMode}`,
    `source::${lesson.id}`,
  ];

  return {
    deckId: HOME_DECK_ID,
    standard: lesson.standard,
    topics,
    skill: question.type,
    difficulty: question.difficulty,
    responseMode,
    sourceLessonId: lesson.id,
    tags: [...new Set(tags)],
  };
}

function canonicalTagValue(value: string) {
  return value.replaceAll("_", "-");
}
