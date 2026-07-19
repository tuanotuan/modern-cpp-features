import { describe, expect, it } from "vitest";

import { reviewSchema, rowsToProgress } from "./cloud";

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

  it("rejects a client-controlled due date that disagrees with the rating", () => {
    expect(
      reviewSchema.safeParse({
        questionId: "cpp11-auto-001",
        reviewedOn: "2026-07-19",
        rating: "easy",
        nextDueOn: "2026-07-20",
      }).success,
    ).toBe(false);
  });
});
