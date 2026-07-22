import { describe, expect, it } from "vitest";

import {
  buildDraftPrompt,
  buildGeneratorSystemInstruction,
  isProviderRateLimitError,
  nextQuestionIds,
  retryProviderRateLimit,
  validateDraftSources,
} from "./drafts";
import type { GeneratedLesson } from "./schema";

describe("question draft IDs", () => {
  it("continues a lesson's numeric sequence without collisions", () => {
    expect(
      nextQuestionIds(
        "cpp11-auto",
        ["cpp11-auto-001", "cpp11-auto-003", "cpp11-nullptr-004"],
        2,
      ),
    ).toEqual(["cpp11-auto-004", "cpp11-auto-005"]);
  });

  it("waits for the provider window and retries a 429", async () => {
    const delays: number[] = [];
    let attempts = 0;
    const result = await retryProviderRateLimit(
      async () => {
        attempts += 1;
        if (attempts === 1) {
          throw Object.assign(new Error("Please retry in 0.01s."), {
            statusCode: 429,
          });
        }
        return "ok";
      },
      { sleep: async (delay) => void delays.push(delay) },
    );

    expect(result).toBe("ok");
    expect(attempts).toBe(2);
    expect(delays).toEqual([1010]);
  });

  it("does not retry non-rate-limit provider errors", async () => {
    let attempts = 0;
    await expect(
      retryProviderRateLimit(async () => {
        attempts += 1;
        throw Object.assign(new Error("Unauthorized"), { statusCode: 401 });
      }),
    ).rejects.toThrow("Unauthorized");
    expect(attempts).toBe(1);
  });

  it("recognizes provider rate-limit errors for deferred generation", () => {
    expect(isProviderRateLimitError({ statusCode: 429 })).toBe(true);
    expect(isProviderRateLimitError({ status: 429 })).toBe(true);
    expect(isProviderRateLimitError({ statusCode: 500 })).toBe(false);
  });
});

describe("question draft conventions", () => {
  const lesson = {
    id: "cpp11-move-semantics",
    title: "Move semantics",
    language: "cpp",
    track: "cpp11",
    standard: "cpp11",
    sections: [
      {
        id: "ownership",
        heading: "Ownership",
        bodyMarkdown: "Move transfers ownership without copying the resource.",
      },
    ],
    code: null,
  } as GeneratedLesson;

  it("requires a grounded production-trading scenario for multi-question batches", () => {
    const prompt = JSON.parse(buildDraftPrompt(lesson, 2)) as {
      rules: string[];
    };
    const rules = prompt.rules.join("\n");

    expect(rules).toContain("at least one question whose type is scenario");
    expect(rules).toContain("production trading system");
    expect(rules).toContain("market-data throughput");
    expect(rules).toContain("Do not merely rename a toy variable");
    expect(rules).toContain("do not assume undocumented infrastructure");
    expect(rules).toContain("Do not require finance-domain knowledge");
  });

  it("prefers but does not force trading context for a single draft", () => {
    const prompt = JSON.parse(buildDraftPrompt(lesson, 1)) as {
      rules: string[];
    };

    expect(prompt.rules.join("\n")).toContain(
      "Prefer type scenario when the lesson can support",
    );
  });

  it("uses Python-specific generation rules for a Python lesson", () => {
    const pythonLesson = {
      ...lesson,
      id: "python-generators",
      title: "Generators",
      language: "python",
      track: "python3",
      standard: "python3",
    } as GeneratedLesson;
    const prompt = JSON.parse(buildDraftPrompt(pythonLesson, 2)) as {
      lesson: { language: string; track: string };
      rules: string[];
    };
    const rules = prompt.rules.join("\n");

    expect(buildGeneratorSystemInstruction(pythonLesson)).toContain(
      "grounded Python interview questions",
    );
    expect(prompt.lesson).toMatchObject({
      language: "python",
      track: "python3",
    });
    expect(rules).toContain("Python software-engineering interviews");
    expect(rules).toContain("market-data ingestion");
    expect(rules).toContain("write or modify Python code");
    expect(rules).not.toContain("write or modify C++ code");
  });

  it("rejects citations outside the exact lesson revision", () => {
    expect(() =>
      validateDraftSources(
        lesson,
        [
          {
            type: "recall",
            responseMode: "text",
            difficulty: "beginner",
            estimatedMinutes: 2,
            prompt: "Move semantics thay đổi ownership như thế nào?",
            code: null,
            hint: "Theo dõi resource owner.",
            answer: {
              short: "Ownership được chuyển sang object đích.",
              detailed: "Object đích nhận resource còn object nguồn vẫn hợp lệ nhưng ở trạng thái xác định bởi type.",
            },
            rubric: {
              required: ["Nêu được ownership transfer"],
              bonus: [],
              misconceptions: [],
            },
            sources: [{ sectionId: "not-in-the-note" }],
          },
        ],
        "test-provider",
      ),
    ).toThrow("unknown section not-in-the-note");
  });
});
