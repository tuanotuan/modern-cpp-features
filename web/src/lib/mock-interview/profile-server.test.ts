import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  WORLDQUANT_CURATED_EVALUATIONS,
  worldQuantRoleQuestionForEvaluation,
} from "./profile-server";
import {
  WORLDQUANT_MOCK_SETS,
  WORLDQUANT_ROLE_QUESTIONS,
} from "./profile";

describe("WorldQuant mock server rubrics", () => {
  it("keeps public curated questions and private rubrics in exact sync", () => {
    expect(
      Object.keys(WORLDQUANT_CURATED_EVALUATIONS).sort(),
    ).toEqual(
      WORLDQUANT_ROLE_QUESTIONS.map((question) => question.id).sort(),
    );
  });

  it("resolves every stored set question with its server-side rubric", () => {
    for (const mockSet of WORLDQUANT_MOCK_SETS) {
      for (const questionId of mockSet.questionIds) {
        expect(worldQuantRoleQuestionForEvaluation(questionId)).not.toBeNull();
      }
    }
  });
});
