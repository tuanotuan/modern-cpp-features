import type { ContentQuestion } from "../content/schema";
import type { QuestionLearningState } from "./learning-state";
import {
  addDays,
  calculateStreak,
  type PracticeProgress,
  type Rating,
} from "./scheduler";

const RATINGS: Rating[] = ["again", "hard", "good", "easy"];

export type PracticeAnalytics = {
  summary: {
    totalReviews: number;
    reviewedToday: number;
    studiedDays: number;
    streak: number;
    retentionPercent: number;
    learnedQuestions: number;
    matureQuestions: number;
    averageIntervalDays: number;
  };
  ratingCounts: Record<Rating, number>;
  stateCounts: Record<"new" | "learning" | "review" | "relearning", number> & {
    suspended: number;
    leech: number;
  };
  activity: Array<{
    date: string;
    count: number;
    ratings: Record<Rating, number>;
  }>;
  forecast: Array<{
    date: string;
    count: number;
  }>;
  overdueCount: number;
  weakTopics: Array<{
    topic: string;
    attempts: number;
    again: number;
    hard: number;
    confidentPercent: number;
    difficultyPercent: number;
  }>;
};

export function buildPracticeAnalytics(
  questions: ContentQuestion[],
  progress: PracticeProgress,
  states: QuestionLearningState[],
  today: string,
): PracticeAnalytics {
  const ratingCounts = emptyRatingCounts();
  const reviewsByDate = new Map<string, Record<Rating, number>>();
  for (const review of progress.reviews) {
    ratingCounts[review.rating] += 1;
    const daily = reviewsByDate.get(review.reviewedOn) ?? emptyRatingCounts();
    daily[review.rating] += 1;
    reviewsByDate.set(review.reviewedOn, daily);
  }

  const activity = Array.from({ length: 28 }, (_, index) => {
    const date = addDays(today, index - 27);
    const ratings = reviewsByDate.get(date) ?? emptyRatingCounts();
    return {
      date,
      count: RATINGS.reduce((sum, rating) => sum + ratings[rating], 0),
      ratings,
    };
  });

  const forecastDates = Array.from({ length: 14 }, (_, index) =>
    addDays(today, index),
  );
  const forecastCounts = new Map(forecastDates.map((date) => [date, 0]));
  let overdueCount = 0;
  for (const state of states) {
    if (state.suspended || state.state === "new" || !state.dueOn) continue;
    if (state.dueOn < today) {
      overdueCount += 1;
      forecastCounts.set(today, (forecastCounts.get(today) ?? 0) + 1);
    } else if (forecastCounts.has(state.dueOn)) {
      forecastCounts.set(
        state.dueOn,
        (forecastCounts.get(state.dueOn) ?? 0) + 1,
      );
    }
  }

  const stateCounts = {
    new: 0,
    learning: 0,
    review: 0,
    relearning: 0,
    suspended: 0,
    leech: 0,
  };
  for (const state of states) {
    stateCounts[state.state] += 1;
    if (state.suspended) stateCounts.suspended += 1;
    if (state.leech) stateCounts.leech += 1;
  }

  const activeIntervals = states
    .filter((state) => !state.suspended && state.state === "review")
    .map((state) => state.intervalDays);
  const totalReviews = progress.reviews.length;
  const retainedReviews = totalReviews - ratingCounts.again;

  return {
    summary: {
      totalReviews,
      reviewedToday: activity.at(-1)?.count ?? 0,
      studiedDays: reviewsByDate.size,
      streak: calculateStreak(progress.reviews, today),
      retentionPercent: percent(retainedReviews, totalReviews),
      learnedQuestions: states.filter((state) => state.state !== "new").length,
      matureQuestions: states.filter(
        (state) =>
          !state.suspended &&
          state.state === "review" &&
          state.intervalDays >= 21,
      ).length,
      averageIntervalDays: activeIntervals.length
        ? Math.round(
            activeIntervals.reduce((sum, interval) => sum + interval, 0) /
              activeIntervals.length,
          )
        : 0,
    },
    ratingCounts,
    stateCounts,
    activity,
    forecast: forecastDates.map((date) => ({
      date,
      count: forecastCounts.get(date) ?? 0,
    })),
    overdueCount,
    weakTopics: buildWeakTopics(questions, progress),
  };
}

function buildWeakTopics(
  questions: ContentQuestion[],
  progress: PracticeProgress,
): PracticeAnalytics["weakTopics"] {
  const topicsByQuestion = new Map(
    questions.map((question) => [question.id, question.taxonomy.topics]),
  );
  const stats = new Map<
    string,
    { attempts: number; again: number; hard: number; confident: number }
  >();

  for (const review of progress.reviews) {
    for (const topic of topicsByQuestion.get(review.questionId) ?? []) {
      const current = stats.get(topic) ?? {
        attempts: 0,
        again: 0,
        hard: 0,
        confident: 0,
      };
      current.attempts += 1;
      if (review.rating === "again") current.again += 1;
      if (review.rating === "hard") current.hard += 1;
      if (review.rating === "good" || review.rating === "easy") {
        current.confident += 1;
      }
      stats.set(topic, current);
    }
  }

  return [...stats.entries()]
    .map(([topic, topicStats]) => ({
      topic,
      ...topicStats,
      confidentPercent: percent(topicStats.confident, topicStats.attempts),
      difficultyPercent: percent(
        topicStats.again * 2 + topicStats.hard,
        topicStats.attempts * 2,
      ),
    }))
    .filter((topic) => topic.attempts > 0)
    .sort(
      (left, right) =>
        right.difficultyPercent - left.difficultyPercent ||
        right.attempts - left.attempts ||
        left.topic.localeCompare(right.topic),
    )
    .slice(0, 6);
}

function emptyRatingCounts(): Record<Rating, number> {
  return { again: 0, hard: 0, good: 0, easy: 0 };
}

function percent(value: number, total: number) {
  return total > 0 ? Math.round((value / total) * 100) : 0;
}
