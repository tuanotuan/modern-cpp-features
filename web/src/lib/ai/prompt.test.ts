import { describe, expect, it } from "vitest";

import manifestJson from "../../generated/content-manifest.json";
import { contentManifestSchema } from "../content/schema";

import { coachFeedbackSchema, coachRequestSchema } from "./contracts";
import { buildCoachPrompt } from "./prompt";

const manifest = contentManifestSchema.parse(manifestJson);

describe("AI coach contract", () => {
  it("builds a grounded prompt with untrusted candidate boundaries", () => {
    const question = manifest.questions[0];
    const lesson = manifest.lessons.find((item) => item.id === question.lessonId)!;
    const prompt = buildCoachPrompt({
      question,
      lesson,
      candidateAnswer: "auto tạo một copy, còn auto& là reference.",
    });

    expect(prompt).toContain(question.rubric.required[0]);
    expect(prompt).toContain(`<source id="${question.sources[0].sectionId}"`);
    expect(prompt).toContain("<candidate_answer>");
  });

  it("rejects short requests and malformed coach responses", () => {
    expect(
      coachRequestSchema.safeParse({ questionId: "cpp11-auto-001", answer: "ngắn" })
        .success,
    ).toBe(false);
    expect(
      coachFeedbackSchema.safeParse({ score: 120, verdict: "perfect" }).success,
    ).toBe(false);
  });
});
