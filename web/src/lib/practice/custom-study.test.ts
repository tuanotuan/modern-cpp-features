import { describe, expect, it } from "vitest";

import type { ContentQuestion } from "../content/schema";
import { newQuestionLearningState } from "./learning-state";
import { buildCustomStudyQueue } from "./custom-study";

const taxonomy = {
  deckId: "cpp-interview",
  standard: "cpp11",
  topics: ["lambda"],
  skill: "recall",
  difficulty: "intermediate",
  responseMode: "text",
  sourceLessonId: "cpp11-lambda",
  tags: [
    "deck::cpp-interview",
    "standard::cpp11",
    "topic::lambda",
    "skill::recall",
    "difficulty::intermediate",
    "response::text",
    "source::cpp11-lambda",
  ],
} satisfies ContentQuestion["taxonomy"];

describe("custom study", () => {
  it("filters by taxonomy and learning state without selecting suspended cards", () => {
    const questions = ["new-one", "new-two", "review-one"].map((id) => ({
      id,
      taxonomy,
    }));
    const states = new Map(
      questions.map((question) => [
        question.id,
        newQuestionLearningState({
          questionId: question.id,
          questionVersion: 1,
          sourceHash: "a".repeat(64),
        }),
      ]),
    );
    states.set("new-two", { ...states.get("new-two")!, suspended: true });
    states.set("review-one", {
      ...states.get("review-one")!,
      state: "review",
      dueOn: "2026-07-21",
      intervalDays: 4,
      reviewCount: 1,
      lastRating: "good",
      lastReviewedOn: "2026-07-17",
    });

    expect(
      buildCustomStudyQueue(questions, states, "2026-07-21", {
        learningState: "new",
        standard: "cpp11",
        skill: "recall",
        topic: "lambda",
        limit: 10,
      }),
    ).toEqual(["new-one"]);
    expect(
      buildCustomStudyQueue(questions, states, "2026-07-21", {
        learningState: "due",
        standard: "all",
        skill: "all",
        topic: "all",
        limit: 10,
      }),
    ).toEqual(["review-one"]);
  });
});
