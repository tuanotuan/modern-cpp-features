import type { ContentQuestion } from "../content/schema";
import type { QuestionLearningState } from "./learning-state";
import { selectDailyQuestion } from "./scheduler";

export type CustomStudyFilters = {
  learningState: "all" | QuestionLearningState["state"] | "due" | "leech";
  standard: "all" | ContentQuestion["taxonomy"]["standard"];
  skill: "all" | ContentQuestion["taxonomy"]["skill"];
  topic: string;
  limit: number;
};

type CustomStudyQuestion = Pick<ContentQuestion, "id" | "taxonomy">;

export function buildCustomStudyQueue(
  questions: CustomStudyQuestion[],
  states: Map<string, QuestionLearningState>,
  today: string,
  filters: CustomStudyFilters,
) {
  const candidates = questions
    .filter((question) => {
      const state = states.get(question.id);
      if (!state || state.suspended || state.lastReviewedOn === today) return false;
      const matchesState =
        filters.learningState === "all" ||
        (filters.learningState === "due"
          ? state.state !== "new" && state.dueOn !== null && state.dueOn <= today
          : filters.learningState === "leech"
            ? state.leech
            : state.state === filters.learningState);
      return (
        matchesState &&
        (filters.standard === "all" ||
          question.taxonomy.standard === filters.standard) &&
        (filters.skill === "all" || question.taxonomy.skill === filters.skill) &&
        (filters.topic === "all" ||
          question.taxonomy.topics.includes(filters.topic))
      );
    })
    .map((question) => question.id);
  const queue: string[] = [];
  const remaining = [...candidates];
  const limit = Math.min(20, Math.max(1, Math.floor(filters.limit)));
  const seed = [
    today,
    filters.learningState,
    filters.standard,
    filters.skill,
    filters.topic,
  ].join(":");

  for (let index = 0; index < limit; index += 1) {
    const selected = selectDailyQuestion(remaining, `${seed}:${index}`);
    if (!selected) break;
    queue.push(selected);
    remaining.splice(remaining.indexOf(selected), 1);
  }
  return queue;
}
