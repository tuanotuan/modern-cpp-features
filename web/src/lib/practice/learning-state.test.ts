import { describe, expect, it } from "vitest";

import {
  buildAnkiDailyQueue,
  buildLearningStates,
  countLearningStates,
  deriveLearningStateFromReviews,
  learningQueuePriority,
  newQuestionLearningState,
  ratingIntervalDays,
  scheduleQuestionReview,
} from "./learning-state";
import type { Review } from "./scheduler";

describe("Anki-style learning-state foundation", () => {
  it("creates an unseen question as New", () => {
    expect(
      newQuestionLearningState({
        questionId: "cpp11-auto-001",
        questionVersion: 2,
        sourceHash: "a".repeat(64),
      }),
    ).toMatchObject({
      state: "new",
      dueOn: null,
      intervalDays: 0,
      reviewCount: 0,
      lapseCount: 0,
    });
  });

  it("backfills existing history without treating the first Again as a lapse", () => {
    const reviews: Review[] = [
      {
        questionId: "cpp11-auto-001",
        reviewedOn: "2026-07-10",
        rating: "again",
        nextDueOn: "2026-07-11",
      },
      {
        questionId: "cpp11-auto-001",
        reviewedOn: "2026-07-11",
        rating: "good",
        nextDueOn: "2026-07-15",
      },
      {
        questionId: "cpp11-auto-001",
        reviewedOn: "2026-07-15",
        rating: "again",
        nextDueOn: "2026-07-16",
      },
    ];

    expect(
      deriveLearningStateFromReviews("cpp11-auto-001", reviews),
    ).toMatchObject({
      state: "relearning",
      dueOn: "2026-07-16",
      intervalDays: 1,
      reviewCount: 3,
      lapseCount: 1,
      lastRating: "again",
    });
  });

  it("orders relearning, learning, review, then new and excludes suspended", () => {
    const base = newQuestionLearningState({
      questionId: "cpp11-auto-001",
      questionVersion: 1,
      sourceHash: "a".repeat(64),
    });

    expect(
      ["new", "review", "learning", "relearning"].map((state) =>
        learningQueuePriority({
          ...base,
          state: state as typeof base.state,
        }),
      ),
    ).toEqual([3, 2, 1, 0]);
    expect(learningQueuePriority({ ...base, suspended: true })).toBe(Infinity);
  });

  it("graduates New cards and lapses Review cards into Relearning", () => {
    const fresh = newQuestionLearningState({
      questionId: "cpp11-auto-001",
      questionVersion: 2,
      sourceHash: "a".repeat(64),
    });
    const learned = scheduleQuestionReview(fresh, "good", "2026-07-21");
    const forgotten = scheduleQuestionReview(
      { ...learned.state, intervalDays: 10 },
      "again",
      "2026-07-24",
    );

    expect(learned.state).toMatchObject({
      state: "review",
      dueOn: "2026-07-24",
      intervalDays: 3,
      reviewCount: 1,
    });
    expect(learned.review).toMatchObject({
      questionVersion: 2,
      stateAfter: "review",
      intervalDaysAfter: 3,
      lapseCountAfter: 0,
    });
    expect(forgotten.state).toMatchObject({
      state: "relearning",
      dueOn: "2026-07-25",
      lapseCount: 1,
    });
  });

  it("grows Review intervals according to Hard, Good, and Easy", () => {
    const review = {
      ...newQuestionLearningState({
        questionId: "cpp11-auto-001",
        questionVersion: 1,
        sourceHash: "a".repeat(64),
      }),
      state: "review" as const,
      intervalDays: 10,
      dueOn: "2026-07-21",
      reviewCount: 2,
    };

    expect(ratingIntervalDays(review, "hard")).toBe(12);
    expect(ratingIntervalDays(review, "good")).toBe(22);
    expect(ratingIntervalDays(review, "easy")).toBe(32);
  });

  it("builds a due-first queue with separate review and new limits", () => {
    const questions = ["new-a", "new-b", "review-a", "review-b", "learn-a"].map(
      (id) => ({ id, version: 1, sourceHash: "a".repeat(64) }),
    );
    const states = buildLearningStates(questions, []);
    states.set("review-a", {
      ...states.get("review-a")!,
      state: "review",
      dueOn: "2026-07-20",
      intervalDays: 4,
      reviewCount: 1,
      lastRating: "good",
      lastReviewedOn: "2026-07-16",
    });
    states.set("review-b", {
      ...states.get("review-b")!,
      state: "review",
      dueOn: "2026-07-20",
      intervalDays: 4,
      reviewCount: 1,
      lastRating: "good",
      lastReviewedOn: "2026-07-16",
    });
    states.set("learn-a", {
      ...states.get("learn-a")!,
      state: "relearning",
      dueOn: "2026-07-21",
      intervalDays: 1,
      reviewCount: 2,
      lastRating: "again",
      lastReviewedOn: "2026-07-20",
    });

    const queue = buildAnkiDailyQueue(states, "2026-07-21", {
      newLimit: 1,
      reviewLimit: 1,
    });

    expect(queue[0]).toBe("learn-a");
    expect(queue).toHaveLength(3);
    expect(queue.filter((id) => id.startsWith("review"))).toHaveLength(1);
    expect(queue.filter((id) => id.startsWith("new"))).toHaveLength(1);
    expect(countLearningStates(states.values())).toEqual({
      new: 2,
      learning: 0,
      review: 2,
      relearning: 1,
    });
  });

  it("uses extended review metadata when restoring a state", () => {
    const restored = deriveLearningStateFromReviews("cpp11-auto-001", [
      {
        questionId: "cpp11-auto-001",
        questionVersion: 3,
        sourceHash: "b".repeat(64),
        reviewedOn: "2026-07-21",
        rating: "hard",
        nextDueOn: "2026-08-02",
        stateAfter: "review",
        intervalDaysAfter: 12,
        lapseCountAfter: 4,
      },
    ]);

    expect(restored).toMatchObject({
      questionVersion: 3,
      sourceHash: "b".repeat(64),
      state: "review",
      intervalDays: 12,
      lapseCount: 4,
    });
  });

  it("prefers the authoritative cloud projection when review dates tie", () => {
    const questions = [
      { id: "cpp11-auto-001", version: 1, sourceHash: "a".repeat(64) },
    ];
    const reviews: Review[] = [
      {
        questionId: "cpp11-auto-001",
        reviewedOn: "2026-07-21",
        rating: "good",
        nextDueOn: "2026-07-25",
      },
    ];
    const local = deriveLearningStateFromReviews(
      "cpp11-auto-001",
      reviews,
      1,
      "a".repeat(64),
    );
    const states = buildLearningStates(questions, reviews, [
      { ...local, intervalDays: 22, dueOn: "2026-08-12" },
    ]);

    expect(states.get("cpp11-auto-001")).toMatchObject({
      intervalDays: 22,
      dueOn: "2026-08-12",
    });
  });

  it("keeps an explicit cloud reset as New even when old local reviews remain", () => {
    const questions = [
      { id: "cpp11-auto-001", version: 1, sourceHash: "a".repeat(64) },
    ];
    const reviews: Review[] = [
      {
        questionId: "cpp11-auto-001",
        reviewedOn: "2026-07-20",
        rating: "good",
        nextDueOn: "2026-07-24",
      },
    ];
    const reset = {
      ...newQuestionLearningState({
        questionId: "cpp11-auto-001",
        questionVersion: 1,
        sourceHash: "a".repeat(64),
      }),
      historyResetOn: "2026-07-21",
    };

    expect(buildLearningStates(questions, reviews, [reset]).get("cpp11-auto-001"))
      .toMatchObject({ state: "new", reviewCount: 0, historyResetOn: "2026-07-21" });
  });
});
