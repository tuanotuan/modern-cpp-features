import { describe, expect, it } from "vitest";

import {
  QuestionStoreConfigurationError,
  parseQuestionStoreMode,
} from "./question-store-config";

describe("question store configuration", () => {
  it("keeps the repository manifest as the safe default", () => {
    expect(parseQuestionStoreMode(undefined)).toBe("repo");
    expect(parseQuestionStoreMode("  ")).toBe("repo");
  });

  it.each(["repo", "shadow", "db"] as const)(
    "accepts %s mode",
    (mode) => {
      expect(parseQuestionStoreMode(mode.toUpperCase())).toBe(mode);
    },
  );

  it("rejects an unknown backend instead of silently cutting over", () => {
    expect(() => parseQuestionStoreMode("supabase")).toThrow(
      QuestionStoreConfigurationError,
    );
  });
});
