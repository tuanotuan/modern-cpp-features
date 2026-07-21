import { addDays, type Rating, type Review } from "./scheduler";

export const LEARNING_STATES = [
  "new",
  "learning",
  "review",
  "relearning",
] as const;

export type LearningState = (typeof LEARNING_STATES)[number];

export type QuestionLearningState = {
  questionId: string;
  questionVersion: number;
  sourceHash: string | null;
  state: LearningState;
  dueOn: string | null;
  intervalDays: number;
  reviewCount: number;
  lapseCount: number;
  lastRating: Rating | null;
  lastReviewedOn: string | null;
  suspended: boolean;
  leech: boolean;
  contentChanged: boolean;
};

export function newQuestionLearningState({
  questionId,
  questionVersion,
  sourceHash,
}: {
  questionId: string;
  questionVersion: number;
  sourceHash: string | null;
}): QuestionLearningState {
  return {
    questionId,
    questionVersion,
    sourceHash,
    state: "new",
    dueOn: null,
    intervalDays: 0,
    reviewCount: 0,
    lapseCount: 0,
    lastRating: null,
    lastReviewedOn: null,
    suspended: false,
    leech: false,
    contentChanged: false,
  };
}

export function deriveLearningStateFromReviews(
  questionId: string,
  reviews: Review[],
  questionVersion = 1,
  sourceHash: string | null = null,
): QuestionLearningState {
  const history = reviews
    .filter((review) => review.questionId === questionId)
    .sort((left, right) => left.reviewedOn.localeCompare(right.reviewedOn));

  if (history.length === 0) {
    return {
      ...newQuestionLearningState({
        questionId,
        questionVersion,
        sourceHash,
      }),
    };
  }

  const latest = history.at(-1)!;
  const intervalDays = Math.max(
    1,
    dateDifferenceDays(latest.reviewedOn, latest.nextDueOn),
  );

  return {
    questionId,
    questionVersion,
    sourceHash,
    state: latest.rating === "again" ? "relearning" : "review",
    dueOn: latest.nextDueOn,
    intervalDays,
    reviewCount: history.length,
    lapseCount: history.slice(1).filter((review) => review.rating === "again")
      .length,
    lastRating: latest.rating,
    lastReviewedOn: latest.reviewedOn,
    suspended: false,
    leech: false,
    contentChanged: false,
  };
}

export function learningQueuePriority(state: QuestionLearningState): number {
  if (state.suspended) return Number.POSITIVE_INFINITY;
  return {
    relearning: 0,
    learning: 1,
    review: 2,
    new: 3,
  }[state.state];
}

function dateDifferenceDays(from: string, to: string) {
  let cursor = from;
  let days = 0;
  while (cursor < to && days < 36_600) {
    cursor = addDays(cursor, 1);
    days += 1;
  }
  return cursor === to ? days : 0;
}
