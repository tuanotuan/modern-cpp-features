import { describe, expect, it } from "vitest";

import manifestJson from "../../generated/content-manifest.json";
import { contentManifestSchema } from "../content/schema";

import {
  coachFeedbackSchema,
  coachFollowUpRequestSchema,
  coachRequestSchema,
  normalizeCoachFeedback,
  type CoachFeedback,
} from "./contracts";
import {
  buildCoachFollowUpPrompt,
  buildCoachPrompt,
  buildCoachSystemInstruction,
} from "./prompt";

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

  it("converts an accidental 8/10 score when verdict and rubric mean solid", () => {
    const normalized = normalizeCoachFeedback({
      ...sampleFeedback(),
      score: 8,
      verdict: "solid",
      coverage: [
        { criterion: "Kết luận", status: "met", feedback: "Đúng." },
        { criterion: "Giải thích", status: "met", feedback: "Đúng." },
        { criterion: "Cách sửa", status: "met", feedback: "Đúng." },
      ],
    });

    expect(normalized.score).toBe(80);
    expect(normalized.verdict).toBe("solid");
  });

  it("keeps a genuine 8/100 needs-work score", () => {
    const normalized = normalizeCoachFeedback({
      ...sampleFeedback(),
      score: 8,
      verdict: "needs_work",
      coverage: [
        { criterion: "Kết luận", status: "missed", feedback: "Sai." },
      ],
    });

    expect(normalized.score).toBe(8);
    expect(normalized.verdict).toBe("needs_work");
  });

  it("requires an alternating follow-up conversation ending with the user", () => {
    const base = {
      questionId: "cpp11-auto-001",
      candidateAnswer: "auto tạo một copy, còn auto& là reference.",
      feedback: sampleFeedback(),
    };
    expect(
      coachFollowUpRequestSchema.safeParse({
        ...base,
        messages: [{ role: "user", content: "Tại sao lại tạo copy?" }],
      }).success,
    ).toBe(true);
    expect(
      coachFollowUpRequestSchema.safeParse({
        ...base,
        messages: [{ role: "assistant", content: "Giải thích" }],
      }).success,
    ).toBe(false);
  });

  it("grounds follow-up prompts in feedback, conversation and source notes", () => {
    const question = manifest.questions[0];
    const lesson = manifest.lessons.find((item) => item.id === question.lessonId)!;
    const prompt = buildCoachFollowUpPrompt({
      question,
      lesson,
      candidateAnswer: "Tôi chưa phân biệt được copy và reference.",
      feedback: sampleFeedback(),
      messages: [{ role: "user", content: "Giải thích bằng ví dụ nhỏ nhé" }],
    });

    expect(prompt).toContain("Giải thích bằng ví dụ nhỏ nhé");
    expect(prompt).toContain(`<source id="${question.sources[0].sectionId}"`);
    expect(prompt).toContain("<grading_feedback>");
  });

  it("uses the lesson language for Python grading and follow-ups", () => {
    const question = manifest.questions[0];
    const sourceLesson = manifest.lessons.find(
      (item) => item.id === question.lessonId,
    )!;
    const lesson = {
      ...sourceLesson,
      language: "python" as const,
      track: "python3" as const,
      standard: "python3" as const,
    };
    const grading = buildCoachPrompt({
      question,
      lesson,
      candidateAnswer: "A sufficiently detailed Python answer.",
    });
    const followUp = buildCoachFollowUpPrompt({
      question,
      lesson,
      candidateAnswer: "A sufficiently detailed Python answer.",
      feedback: sampleFeedback(),
      messages: [{ role: "user", content: "Cho tôi một ví dụ nhỏ." }],
    });

    expect(grading).toContain("phỏng vấn Python");
    expect(followUp).toContain("ví dụ Python ngắn");
    expect(buildCoachSystemInstruction(lesson, "evaluate")).toContain(
      "senior Python interviewer",
    );
  });
});

function sampleFeedback(): CoachFeedback {
  return {
    score: 60,
    verdict: "partial",
    summary: "Hiểu một phần.",
    strengths: ["Nhận ra reference."],
    coverage: [
      { criterion: "Phân biệt copy", status: "partial", feedback: "Còn thiếu ví dụ." },
    ],
    corrections: [],
    explanation: "auto thường suy luận theo giá trị.",
    nextStep: "Ôn lại type deduction.",
    followUpQuestion: "Khi nào dùng const auto&?",
    suggestedRating: "hard",
    sourceSectionIds: [],
  };
}
