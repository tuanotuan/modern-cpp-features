import { describe, expect, it } from "vitest";

import {
  buildCandidateAnswer,
  SCENARIO_CODE_MAX,
  SCENARIO_EXPLANATION_MAX,
} from "./candidate-answer";

describe("buildCandidateAnswer", () => {
  it("keeps ordinary interview answers as plain text", () => {
    expect(
      buildCandidateAnswer({ type: "recall" }, "  RAII owns cleanup.  ", ""),
    ).toBe("RAII owns cleanup.");
  });

  it("sends scenario code and design reasoning as one grounded answer", () => {
    const result = buildCandidateAnswer(
      { type: "scenario" },
      "The object has unique ownership.",
      "class FileHandle {};",
    );

    expect(result).toContain("```cpp\nclass FileHandle {};\n```");
    expect(result).toContain("Giải thích quyết định thiết kế");
    expect(result).toContain("unique ownership");
  });

  it("requires code and stays below the API/database answer limit", () => {
    expect(buildCandidateAnswer({ type: "scenario" }, "reason", "")).toBe("");

    const result = buildCandidateAnswer(
      { type: "scenario" },
      "x".repeat(SCENARIO_EXPLANATION_MAX + 100),
      "y".repeat(SCENARIO_CODE_MAX + 100),
    );
    expect(result.length).toBeLessThanOrEqual(6000);
  });
});

