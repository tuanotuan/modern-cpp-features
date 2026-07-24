import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mock-interview/profile", async () =>
  import("../mock-interview/profile"));

import {
  classifyOutcomeLimit,
  sanitizeRunnerOutput,
} from "./vercel-sandbox.server";

describe("sandbox result sanitization", () => {
  it("strips ANSI, controls, and private sandbox paths", () => {
    expect(
      sanitizeRunnerOutput(
        "\u001b[31m/home/candidate/work/main.cpp\u001b[0m\0",
        200,
      ),
    ).toBe("main.cpp");
  });

  it("keeps the final string inside the schema limit", () => {
    const result = sanitizeRunnerOutput("x".repeat(500), 100);
    expect(result.length).toBeLessThanOrEqual(100);
    expect(result).toContain("rút gọn");
  });
});

describe("sandbox command limit classification", () => {
  it("classifies an enforced timeout but not a normal failure", () => {
    expect(
      classifyOutcomeLimit(
        {
          exitCode: 124,
          durationMs: 1_950,
          stdout: "",
          stderr: "",
        },
        2_000,
      ),
    ).toBe("time");
    expect(
      classifyOutcomeLimit(
        {
          exitCode: 1,
          durationMs: 100,
          stdout: "",
          stderr: "ordinary compiler error",
        },
        2_000,
      ),
    ).toBeUndefined();
  });
});
