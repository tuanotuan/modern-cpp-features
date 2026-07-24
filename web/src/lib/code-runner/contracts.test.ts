import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/mock-interview/profile", async () =>
  import("../mock-interview/profile"));

import {
  CODE_RUNNER_MAX_SOURCE_BYTES,
  codeExecutionResultSchema,
  isSourceWithinByteLimit,
  mockCodeRunRequestSchema,
} from "./contracts";
import {
  WORLDQUANT_MOCK_SETS,
  WORLDQUANT_ROLE_QUESTIONS,
} from "../mock-interview/profile";

function validRunRequest() {
  const mockSet = WORLDQUANT_MOCK_SETS.find(
    (item) => item.id === "worldquant-45-a",
  )!;
  const question = WORLDQUANT_ROLE_QUESTIONS.find(
    (item) => item.id === "worldquant-interval-stats-cpp",
  )!;
  return {
    idempotencyKey: "6a585fad-4933-4f9f-b3c3-bbb2bd2ecffc",
    sessionId: "9f58ceae-6ce7-4d56-bf6e-2be2256cc063",
    profileId: "worldquant-tick-data-engineer",
    profileVersion: 3,
    setId: mockSet.id,
    setVersion: mockSet.version,
    sourceRevision: "a".repeat(40),
    questionId: question.id,
    origin: question.origin,
    questionVersion: question.version,
    contentRevision: question.contentRevision,
    code: question.code!,
  };
}

function validExecutionResult() {
  return {
    suite: "sample",
    codeHash: "c".repeat(64),
    specRevision: 1,
    language: "cpp",
    status: "passed",
    passedTests: 2,
    totalTests: 2,
    durationMs: 250,
    diagnostics: "",
    output: "",
    cases: [{ name: "sample", passed: true }],
    toolchain: "recall-sandbox-v1",
    completedAt: "2026-07-24T08:00:00.000Z",
  };
}

describe("mock code-run request contract", () => {
  it("accepts a strict profile-v3 executable question request", () => {
    expect(mockCodeRunRequestSchema.safeParse(validRunRequest()).success)
      .toBe(true);
  });

  it("rejects profile v2, an unknown field and a malformed idempotency key", () => {
    const request = validRunRequest();
    expect(
      mockCodeRunRequestSchema.safeParse({
        ...request,
        profileVersion: 2,
      }).success,
    ).toBe(false);
    expect(
      mockCodeRunRequestSchema.safeParse({
        ...request,
        suite: "hidden",
      }).success,
    ).toBe(false);
    expect(
      mockCodeRunRequestSchema.safeParse({
        ...request,
        idempotencyKey: "retry-me",
      }).success,
    ).toBe(false);
  });

  it("enforces the source limit in UTF-8 bytes and rejects NUL", () => {
    expect(isSourceWithinByteLimit("a".repeat(CODE_RUNNER_MAX_SOURCE_BYTES)))
      .toBe(true);
    expect(
      isSourceWithinByteLimit(
        "é".repeat(Math.floor(CODE_RUNNER_MAX_SOURCE_BYTES / 2) + 1),
      ),
    ).toBe(false);
    expect(isSourceWithinByteLimit("int main() {}\0")).toBe(false);
  });
});

describe("code execution result contract", () => {
  it("accepts bounded deterministic sample evidence", () => {
    expect(codeExecutionResultSchema.safeParse(validExecutionResult()).success)
      .toBe(true);
  });

  it("rejects invalid hashes and oversized public diagnostics", () => {
    const result = validExecutionResult();
    expect(
      codeExecutionResultSchema.safeParse({
        ...result,
        codeHash: "not-a-sha256",
      }).success,
    ).toBe(false);
    expect(
      codeExecutionResultSchema.safeParse({
        ...result,
        diagnostics: "x".repeat(16_001),
      }).success,
    ).toBe(false);
  });
});
