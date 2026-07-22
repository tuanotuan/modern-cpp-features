import { describe, expect, it } from "vitest";

import {
  buildCandidateAnswer,
  requiresCodeAnswer,
  SCENARIO_CODE_MAX,
  SCENARIO_EXPLANATION_MAX,
} from "./candidate-answer";

describe("buildCandidateAnswer", () => {
  it("keeps ordinary interview answers as plain text", () => {
    expect(
      buildCandidateAnswer({ type: "recall" }, "  RAII owns cleanup.  ", ""),
    ).toBe("RAII owns cleanup.");
  });

  it("does not infer a code editor from the scenario tag", () => {
    const question = {
      id: "cpp98-struct-padding-001",
      type: "scenario",
    };
    expect(requiresCodeAnswer(question)).toBe(false);
    expect(buildCandidateAnswer(question, "Padding follows alignment.", "ignored"))
      .toBe("Padding follows alignment.");
  });

  it("uses the code editor only for explicit code-response questions", () => {
    expect(
      requiresCodeAnswer({
        id: "new-design-question",
        type: "scenario",
        responseMode: "code",
      }),
    ).toBe(true);
    expect(
      requiresCodeAnswer({
        id: "cpp11-mutable-lambda-002",
        type: "scenario",
      }),
    ).toBe(true);
  });

  it("sends scenario code and design reasoning as one grounded answer", () => {
    const result = buildCandidateAnswer(
      { type: "scenario", responseMode: "code" },
      "The object has unique ownership.",
      "class FileHandle {};",
    );

    expect(result).toContain("```cpp\nclass FileHandle {};\n```");
    expect(result).toContain("Giải thích quyết định thiết kế");
    expect(result).toContain("unique ownership");
  });

  it("labels and fences Python code with the lesson language", () => {
    const result = buildCandidateAnswer(
      { type: "scenario", responseMode: "code", language: "python" },
      "The generator streams values lazily.",
      "def values():\n    yield 1",
    );

    expect(result).toContain("Thiết kế Python");
    expect(result).toContain("```python\ndef values():\n    yield 1\n```");
  });

  it("requires code and stays below the API/database answer limit", () => {
    expect(
      buildCandidateAnswer(
        { type: "scenario", responseMode: "code" },
        "reason",
        "",
      ),
    ).toBe("");

    const result = buildCandidateAnswer(
      { type: "scenario", responseMode: "code" },
      "x".repeat(SCENARIO_EXPLANATION_MAX + 100),
      "y".repeat(SCENARIO_CODE_MAX + 100),
    );
    expect(result.length).toBeLessThanOrEqual(6000);
  });
});
