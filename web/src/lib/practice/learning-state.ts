import {
  addDays,
  selectDailyQuestion,
  type PracticeProgress,
  type Rating,
  type Review,
} from "./scheduler";

export const MAX_NEW_PER_DAY = 1;
export const MAX_REVIEW_PER_DAY = 5;
export const LEECH_LAPSE_THRESHOLD = 8;

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

export type QuestionIdentity = {
  id: string;
  version: number;
  sourceHash: string;
};

export type LearningStateCounts = Record<LearningState, number>;

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
  const intervalDays =
    latest.intervalDaysAfter ??
    Math.max(1, dateDifferenceDays(latest.reviewedOn, latest.nextDueOn));
  const state =
    latest.stateAfter ??
    (latest.rating === "again" ? "relearning" : "review");
  const lapseCount =
    latest.lapseCountAfter ??
    history.slice(1).filter((review) => review.rating === "again").length;

  return {
    questionId,
    questionVersion: latest.questionVersion ?? questionVersion,
    sourceHash: latest.sourceHash ?? sourceHash,
    state,
    dueOn: latest.nextDueOn,
    intervalDays,
    reviewCount: history.length,
    lapseCount,
    lastRating: latest.rating,
    lastReviewedOn: latest.reviewedOn,
    suspended: false,
    leech: lapseCount >= LEECH_LAPSE_THRESHOLD,
    contentChanged: false,
  };
}

export function buildLearningStates(
  questions: QuestionIdentity[],
  reviews: Review[],
  cloudStates: QuestionLearningState[] = [],
): Map<string, QuestionLearningState> {
  const cloudById = new Map(cloudStates.map((state) => [state.questionId, state]));
  return new Map(
    questions.map((question) => {
      const cloud = cloudById.get(question.id);
      const local = deriveLearningStateFromReviews(
        question.id,
        reviews,
        question.version,
        question.sourceHash,
      );
      const state = newerState(local, cloud);
      const contentChanged = Boolean(
        state.sourceHash &&
          (state.sourceHash !== question.sourceHash ||
            state.questionVersion !== question.version),
      );

      return [
        question.id,
        {
          ...state,
          questionVersion: question.version,
          sourceHash: question.sourceHash,
          state: contentChanged ? "learning" : state.state,
          dueOn: contentChanged ? null : state.dueOn,
          intervalDays: contentChanged ? 0 : state.intervalDays,
          contentChanged,
        },
      ];
    }),
  );
}

export function scheduleQuestionReview(
  current: QuestionLearningState,
  rating: Rating,
  reviewedOn: string,
): { state: QuestionLearningState; review: Review } {
  const transition = transitionFor(current, rating);
  const lapseCount =
    current.lapseCount +
    (current.state === "review" && rating === "again" ? 1 : 0);
  const dueOn = addDays(reviewedOn, transition.intervalDays);
  const next: QuestionLearningState = {
    ...current,
    state: transition.state,
    dueOn,
    intervalDays: transition.intervalDays,
    reviewCount: current.reviewCount + 1,
    lapseCount,
    lastRating: rating,
    lastReviewedOn: reviewedOn,
    leech: lapseCount >= LEECH_LAPSE_THRESHOLD,
    contentChanged: false,
  };

  return {
    state: next,
    review: {
      questionId: current.questionId,
      questionVersion: current.questionVersion,
      sourceHash: current.sourceHash ?? undefined,
      reviewedOn,
      rating,
      nextDueOn: dueOn,
      stateAfter: next.state === "new" ? undefined : next.state,
      intervalDaysAfter: next.intervalDays,
      lapseCountAfter: next.lapseCount,
    },
  };
}

export function recordScheduledReview(
  progress: PracticeProgress,
  review: Review,
): PracticeProgress {
  return {
    version: progress.version,
    reviews: [
      ...progress.reviews.filter(
        (item) =>
          !(
            item.questionId === review.questionId &&
            item.reviewedOn === review.reviewedOn
          ),
      ),
      review,
    ],
  };
}

export function buildAnkiDailyQueue(
  states: Map<string, QuestionLearningState>,
  dateKey: string,
  {
    newLimit = MAX_NEW_PER_DAY,
    reviewLimit = MAX_REVIEW_PER_DAY,
  }: { newLimit?: number; reviewLimit?: number } = {},
): string[] {
  const available = [...states.values()].filter(
    (state) => !state.suspended && state.lastReviewedOn !== dateKey,
  );
  const due = (state: QuestionLearningState) =>
    state.dueOn === null || state.dueOn <= dateKey;
  const learning = available
    .filter(
      (state) =>
        (state.state === "learning" || state.state === "relearning") &&
        due(state),
    )
    .sort(compareQueueStates);
  const reviews = available
    .filter((state) => state.state === "review" && due(state))
    .sort(compareQueueStates)
    .slice(0, Math.max(0, reviewLimit));
  const newIds = available
    .filter((state) => state.state === "new")
    .map((state) => state.questionId);
  const newQuestions: string[] = [];
  const candidates = [...newIds];
  for (let index = 0; index < Math.max(0, newLimit); index += 1) {
    const selected = selectDailyQuestion(candidates, `${dateKey}:${index}`);
    if (!selected) break;
    newQuestions.push(selected);
    candidates.splice(candidates.indexOf(selected), 1);
  }

  return [
    ...learning.map((state) => state.questionId),
    ...reviews.map((state) => state.questionId),
    ...newQuestions,
  ];
}

export function countLearningStates(
  states: Iterable<QuestionLearningState>,
): LearningStateCounts {
  const counts: LearningStateCounts = {
    new: 0,
    learning: 0,
    review: 0,
    relearning: 0,
  };
  for (const state of states) {
    if (!state.suspended) counts[state.state] += 1;
  }
  return counts;
}

export function ratingIntervalDays(
  current: QuestionLearningState,
  rating: Rating,
) {
  return transitionFor(current, rating).intervalDays;
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

function transitionFor(
  current: QuestionLearningState,
  rating: Rating,
): { state: Exclude<LearningState, "new">; intervalDays: number } {
  type Transition = {
    state: Exclude<LearningState, "new">;
    intervalDays: number;
  };
  const state = current.contentChanged ? "learning" : current.state;
  if (state === "new" || state === "learning") {
    const transitions: Record<Rating, Transition> = {
      again: { state: "learning", intervalDays: 1 },
      hard: { state: "learning", intervalDays: 2 },
      good: { state: "review", intervalDays: 3 },
      easy: { state: "review", intervalDays: 7 },
    };
    return transitions[rating];
  }
  if (state === "relearning") {
    const transitions: Record<Rating, Transition> = {
      again: { state: "relearning", intervalDays: 1 },
      hard: { state: "relearning", intervalDays: 2 },
      good: { state: "review", intervalDays: 3 },
      easy: { state: "review", intervalDays: 7 },
    };
    return transitions[rating];
  }

  const currentInterval = Math.max(1, current.intervalDays);
  if (rating === "again") return { state: "relearning", intervalDays: 1 };
  if (rating === "hard") {
    return {
      state: "review",
      intervalDays: Math.max(currentInterval + 1, Math.ceil(currentInterval * 1.2)),
    };
  }
  if (rating === "good") {
    return {
      state: "review",
      intervalDays: Math.max(currentInterval + 1, Math.ceil(currentInterval * 2.2)),
    };
  }
  return {
    state: "review",
    intervalDays: Math.max(currentInterval + 2, Math.ceil(currentInterval * 3.2)),
  };
}

function newerState(
  local: QuestionLearningState,
  cloud?: QuestionLearningState,
) {
  if (!cloud) return local;
  if (!local.lastReviewedOn) return cloud;
  if (!cloud.lastReviewedOn) return local;
  return local.lastReviewedOn > cloud.lastReviewedOn ? local : cloud;
}

function compareQueueStates(
  left: QuestionLearningState,
  right: QuestionLearningState,
) {
  return (
    learningQueuePriority(left) - learningQueuePriority(right) ||
    (left.dueOn ?? "").localeCompare(right.dueOn ?? "") ||
    left.questionId.localeCompare(right.questionId)
  );
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
