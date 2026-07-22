import { questionRevisionChecksum } from "./backfill";
import type { AiQuestionDraft } from "./drafts";
import type {
  ContentQuestion,
  GeneratedLesson,
  Question,
} from "./schema";
import { buildQuestionTaxonomy } from "./taxonomy";

export type DatabaseQuestionDraft = AiQuestionDraft & {
  contentChecksum: string;
  taxonomy: ContentQuestion["taxonomy"];
};

export function materializeDatabaseQuestionDrafts(
  lesson: GeneratedLesson,
  drafts: AiQuestionDraft[],
): DatabaseQuestionDraft[] {
  return drafts.map((draft, index) => {
    const questionBase: Question = {
      ...draft,
      id: `${lesson.id}-${String(index + 1).padStart(3, "0")}`,
      lessonId: lesson.id,
      code: draft.code ?? undefined,
      sourceHash: lesson.sourceHash,
      status: "draft",
      version: 1,
    };
    const question: ContentQuestion = {
      ...questionBase,
      taxonomy: buildQuestionTaxonomy(questionBase, lesson),
    };

    return {
      ...draft,
      taxonomy: question.taxonomy,
      contentChecksum: questionRevisionChecksum(question),
    };
  });
}
