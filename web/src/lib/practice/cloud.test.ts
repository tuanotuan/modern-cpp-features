import { describe, expect, it } from "vitest";

import { reviewSchema, rowsToLearningStates, rowsToProgress } from "./cloud";

describe("cloud progress contract", () => {
  it("maps private database rows back to scheduler reviews", () => {
    expect(
      rowsToProgress([
        {
          question_id: "cpp11-auto-001",
          reviewed_on: "2026-07-19",
          rating: "good",
          next_due_on: "2026-07-23",
        },
      ]).reviews[0],
    ).toEqual({
      questionId: "cpp11-auto-001",
      reviewedOn: "2026-07-19",
      rating: "good",
      nextDueOn: "2026-07-23",
    });
  });

  it("accepts adaptive intervals but rejects incomplete transition metadata", () => {
    expect(
      reviewSchema.safeParse({
        questionId: "cpp11-auto-001",
        reviewedOn: "2026-07-19",
        rating: "easy",
        nextDueOn: "2026-08-20",
        questionVersion: 2,
        sourceHash: "a".repeat(64),
        stateAfter: "review",
        intervalDaysAfter: 32,
        lapseCountAfter: 1,
      }).success,
    ).toBe(true);
    expect(
      reviewSchema.safeParse({
        questionId: "cpp11-auto-001",
        reviewedOn: "2026-07-19",
        rating: "easy",
        nextDueOn: "2026-08-20",
        questionVersion: 2,
      }).success,
    ).toBe(false);
  });

  it("maps the current private learning-state projection", () => {
    expect(
      rowsToLearningStates([
        {
          question_id: "cpp11-auto-001",
          question_version: 2,
          source_hash: "a".repeat(64),
          learning_state: "relearning",
          due_on: "2026-07-22",
          interval_days: 1,
          review_count: 4,
          lapse_count: 2,
          last_rating: "again",
          last_reviewed_on: "2026-07-21",
          is_suspended: false,
          is_leech: false,
          content_changed: false,
          history_reset_on: null,
        },
      ])[0],
    ).toMatchObject({
      questionId: "cpp11-auto-001",
      state: "relearning",
      intervalDays: 1,
      lapseCount: 2,
    });
  });
});
