import { z } from "zod";

import {
  PROGRESS_VERSION,
  type PracticeProgress,
  type Review,
} from "./scheduler";
import type { QuestionLearningState } from "./learning-state";

export const reviewSchema = z
  .object({
    questionId: z.string().regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/).max(100),
    reviewedOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    rating: z.enum(["again", "hard", "good", "easy"]),
    nextDueOn: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
    questionVersion: z.number().int().positive().optional(),
    sourceHash: z.string().regex(/^[a-f0-9]{64}$/).optional(),
    stateAfter: z.enum(["learning", "review", "relearning"]).optional(),
    intervalDaysAfter: z.number().int().positive().optional(),
    lapseCountAfter: z.number().int().nonnegative().optional(),
  })
  .superRefine((review, context) => {
    if (review.nextDueOn < review.reviewedOn) {
      context.addIssue({
        code: "custom",
        message: "nextDueOn cannot be before reviewedOn",
      });
    }
    const transitionValues = [
      review.questionVersion,
      review.sourceHash,
      review.stateAfter,
      review.intervalDaysAfter,
      review.lapseCountAfter,
    ];
    const supplied = transitionValues.filter((value) => value !== undefined);
    if (supplied.length > 0 && supplied.length !== transitionValues.length) {
      context.addIssue({
        code: "custom",
        message: "Anki transition metadata must be supplied together",
      });
    }
  });

export const syncProgressSchema = z.object({
  reviews: z.array(reviewSchema).max(600),
});

export type PracticeReviewRow = {
  question_id: string;
  reviewed_on: string;
  rating: Review["rating"];
  next_due_on: string;
  question_version?: number | null;
  source_hash?: string | null;
  learning_state_after?: Review["stateAfter"] | null;
  interval_days_after?: number | null;
  lapse_count_after?: number | null;
};

export type QuestionLearningStateRow = {
  question_id: string;
  question_version: number;
  source_hash: string | null;
  learning_state: QuestionLearningState["state"];
  due_on: string | null;
  interval_days: number;
  review_count: number;
  lapse_count: number;
  last_rating: QuestionLearningState["lastRating"];
  last_reviewed_on: string | null;
  is_suspended: boolean;
  is_leech: boolean;
  content_changed: boolean;
};

export function rowsToProgress(rows: PracticeReviewRow[]): PracticeProgress {
  return {
    version: PROGRESS_VERSION,
    reviews: rows.map((row) => {
      const review: Review = {
        questionId: row.question_id,
        reviewedOn: row.reviewed_on,
        rating: row.rating,
        nextDueOn: row.next_due_on,
      };
      if (
        row.question_version &&
        row.source_hash &&
        row.learning_state_after &&
        row.interval_days_after &&
        row.lapse_count_after !== null &&
        row.lapse_count_after !== undefined
      ) {
        review.questionVersion = row.question_version;
        review.sourceHash = row.source_hash;
        review.stateAfter = row.learning_state_after;
        review.intervalDaysAfter = row.interval_days_after;
        review.lapseCountAfter = row.lapse_count_after;
      }
      return review;
    }),
  };
}

export function rowsToLearningStates(
  rows: QuestionLearningStateRow[],
): QuestionLearningState[] {
  return rows.map((row) => ({
    questionId: row.question_id,
    questionVersion: row.question_version,
    sourceHash: row.source_hash,
    state: row.learning_state,
    dueOn: row.due_on,
    intervalDays: row.interval_days,
    reviewCount: row.review_count,
    lapseCount: row.lapse_count,
    lastRating: row.last_rating,
    lastReviewedOn: row.last_reviewed_on,
    suspended: row.is_suspended,
    leech: row.is_leech,
    contentChanged: row.content_changed,
  }));
}

export function hasAnkiTransition(review: Review) {
  return (
    review.questionVersion !== undefined &&
    review.sourceHash !== undefined &&
    review.stateAfter !== undefined &&
    review.intervalDaysAfter !== undefined &&
    review.lapseCountAfter !== undefined
  );
}
