import { describe, expect, it } from "vitest";

import {
  deriveLearningStateFromReviews,
  learningQueuePriority,
  newQuestionLearningState,
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
});
