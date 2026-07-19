import { describe, expect, it } from "vitest";

import {
  addDays,
  buildDailyQueue,
  calculateStreak,
  mergeProgress,
  nextDueDate,
  parseProgress,
  recordReview,
  reviewsForCloudSync,
  selectDailyQuestion,
  type Review,
} from "./scheduler";

describe("practice scheduler", () => {
  it("selects one stable primary question for a date", () => {
    const ids = ["q-3", "q-1", "q-2"];
    const first = selectDailyQuestion(ids, "2026-07-19");

    expect(first).not.toBeNull();
    expect(selectDailyQuestion([...ids].reverse(), "2026-07-19")).toBe(first);
  });

  it("queues the primary plus at most five due reviews", () => {
    const ids = Array.from({ length: 8 }, (_, index) => `q-${index + 1}`);
    const primary = selectDailyQuestion(ids, "2026-07-19");
    const reviews: Review[] = ids.map((questionId, index) => ({
      questionId,
      reviewedOn: "2026-07-10",
      rating: "again",
      nextDueOn: `2026-07-${String(11 + index).padStart(2, "0")}`,
    }));

    const queue = buildDailyQueue(ids, reviews, "2026-07-19");

    expect(queue[0]).toBe(primary);
    expect(queue).toHaveLength(6);
    expect(new Set(queue).size).toBe(queue.length);
  });

  it("stores one review per question per day and schedules its next due date", () => {
    const progress = recordReview(
      { version: 1, reviews: [] },
      "q-1",
      "good",
      "2026-07-19",
    );
    const updated = recordReview(progress, "q-1", "easy", "2026-07-19");

    expect(updated.reviews).toEqual([
      {
        questionId: "q-1",
        reviewedOn: "2026-07-19",
        rating: "easy",
        nextDueOn: "2026-07-26",
      },
    ]);
    expect(nextDueDate("2026-07-19", "again")).toBe("2026-07-20");
  });

  it("calculates a consecutive-day streak and tolerates broken storage", () => {
    const reviews: Review[] = ["2026-07-17", "2026-07-18", "2026-07-19"].map(
      (reviewedOn) => ({
        questionId: reviewedOn,
        reviewedOn,
        rating: "good",
        nextDueOn: addDays(reviewedOn, 4),
      }),
    );

    expect(calculateStreak(reviews, "2026-07-19")).toBe(3);
    expect(parseProgress("not-json").reviews).toEqual([]);
  });

  it("merges local and cloud reviews without duplicate question-days", () => {
    const local = recordReview(
      { version: 1, reviews: [] },
      "q-1",
      "hard",
      "2026-07-19",
    );
    const cloud = recordReview(
      { version: 1, reviews: [] },
      "q-1",
      "good",
      "2026-07-19",
    );

    expect(mergeProgress(cloud, local).reviews).toEqual(local.reviews);
  });

  it("syncs recent history plus the latest state for every question", () => {
    const reviews: Review[] = Array.from({ length: 8 }, (_, index) => ({
      questionId: index === 0 ? "old-question" : "active-question",
      reviewedOn: `2026-07-${String(index + 10).padStart(2, "0")}`,
      rating: "good",
      nextDueOn: `2026-07-${String(index + 14).padStart(2, "0")}`,
    }));

    const selected = reviewsForCloudSync(reviews, 3);

    expect(selected).toHaveLength(4);
    expect(selected.some((review) => review.questionId === "old-question")).toBe(true);
  });
});
