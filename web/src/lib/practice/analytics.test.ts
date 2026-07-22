import { describe, expect, it } from "vitest";

import type { ContentQuestion } from "../content/schema";
import type { QuestionLearningState } from "./learning-state";
import { buildPracticeAnalytics } from "./analytics";
import type { PracticeProgress } from "./scheduler";

const questions = [
  {
    id: "q-one",
    taxonomy: { topics: ["lambda"] },
  },
  {
    id: "q-two",
    taxonomy: { topics: ["move-semantics"] },
  },
] as ContentQuestion[];

const progress: PracticeProgress = {
  version: 1,
  reviews: [
    {
      questionId: "q-one",
      reviewedOn: "2026-07-20",
      rating: "again",
      nextDueOn: "2026-07-21",
    },
    {
      questionId: "q-one",
      reviewedOn: "2026-07-21",
      rating: "hard",
      nextDueOn: "2026-07-23",
    },
    {
      questionId: "q-two",
      reviewedOn: "2026-07-21",
      rating: "easy",
      nextDueOn: "2026-08-20",
    },
  ],
};

function state(
  questionId: string,
  dueOn: string,
  intervalDays: number,
): QuestionLearningState {
  return {
    questionId,
    questionVersion: 1,
    sourceHash: null,
    state: "review",
    dueOn,
    intervalDays,
    reviewCount: 1,
    lapseCount: 0,
    lastRating: "good",
    lastReviewedOn: "2026-07-20",
    suspended: false,
    leech: false,
    contentChanged: false,
    historyResetOn: null,
  };
}

describe("practice analytics", () => {
  it("summarizes activity, retention, states, and intervals", () => {
    const result = buildPracticeAnalytics(
      questions,
      progress,
      [state("q-one", "2026-07-19", 3), state("q-two", "2026-07-25", 30)],
      "2026-07-21",
    );

    expect(result.summary).toMatchObject({
      totalReviews: 3,
      reviewedToday: 2,
      studiedDays: 2,
      streak: 2,
      retentionPercent: 67,
      learnedQuestions: 2,
      matureQuestions: 1,
      averageIntervalDays: 17,
    });
    expect(result.ratingCounts).toEqual({ again: 1, hard: 1, good: 0, easy: 1 });
    expect(result.activity.at(-1)).toMatchObject({ date: "2026-07-21", count: 2 });
  });

  it("rolls overdue cards into today and ranks difficult topics", () => {
    const result = buildPracticeAnalytics(
      questions,
      progress,
      [state("q-one", "2026-07-19", 3), state("q-two", "2026-07-25", 30)],
      "2026-07-21",
    );

    expect(result.overdueCount).toBe(1);
    expect(result.forecast[0]).toEqual({ date: "2026-07-21", count: 1 });
    expect(result.forecast[4]).toEqual({ date: "2026-07-25", count: 1 });
    expect(result.weakTopics[0]).toMatchObject({
      topic: "lambda",
      attempts: 2,
      again: 1,
      hard: 1,
      difficultyPercent: 75,
    });
  });

  it("excludes suspended cards from maturity and forecast", () => {
    const suspended = { ...state("q-one", "2026-07-21", 30), suspended: true };
    const result = buildPracticeAnalytics(
      questions,
      { version: 1, reviews: [] },
      [suspended],
      "2026-07-21",
    );

    expect(result.summary.matureQuestions).toBe(0);
    expect(result.forecast[0].count).toBe(0);
    expect(result.stateCounts.suspended).toBe(1);
  });

  it("does not mix reviews from another language deck", () => {
    const result = buildPracticeAnalytics(
      [questions[0]],
      progress,
      [state("q-one", "2026-07-23", 3)],
      "2026-07-21",
    );

    expect(result.summary.totalReviews).toBe(2);
    expect(result.summary.reviewedToday).toBe(1);
    expect(result.ratingCounts.easy).toBe(0);
    expect(result.weakTopics.map((topic) => topic.topic)).toEqual(["lambda"]);
  });
});
