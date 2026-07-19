import { z } from "zod";

import {
  PROGRESS_VERSION,
  nextDueDate,
  type PracticeProgress,
  type Review,
} from "./scheduler";

export const reviewSchema = z
  .object({
    questionId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
    reviewedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rating: z.enum(["again", "hard", "good", "easy"]),
    nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  })
  .refine(
    (review) => review.nextDueOn === nextDueDate(review.reviewedOn, review.rating),
    { message: "nextDueOn does not match the review interval" },
  );

export const syncProgressSchema = z.object({
  reviews: z.array(reviewSchema).max(600),
});

export type PracticeReviewRow = {
  question_id: string;
  reviewed_on: string;
  rating: Review["rating"];
  next_due_on: string;
};

export function rowsToProgress(rows: PracticeReviewRow[]): PracticeProgress {
  return {
    version: PROGRESS_VERSION,
    reviews: rows.map((row) => ({
      questionId: row.question_id,
      reviewedOn: row.reviewed_on,
      rating: row.rating,
      nextDueOn: row.next_due_on,
    })),
  };
}
