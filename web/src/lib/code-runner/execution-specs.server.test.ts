import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/mock-interview/profile", async () =>
  import("../mock-interview/profile"));

import {
  allMockExecutionSpecs,
  mockExecutionSpecByQuestionId,
  mockExecutionSpecForQuestion,
} from "./execution-specs.server";
import { WORLDQUANT_ROLE_QUESTIONS } from "../mock-interview/profile";

describe("mock execution spec registry", () => {
  it("keeps public executable metadata and private specs one-to-one", () => {
    const executableQuestions = WORLDQUANT_ROLE_QUESTIONS.filter(
      (question) => question.execution,
    );
    expect(
      allMockExecutionSpecs().map((spec) => spec.questionId).sort(),
    ).toEqual(executableQuestions.map((question) => question.id).sort());

    for (const question of executableQuestions) {
      const spec = mockExecutionSpecForQuestion(question);
      expect(spec).toMatchObject({
        questionId: question.id,
        questionVersion: question.version,
        contentRevision: question.contentRevision,
        revision: question.execution!.specRevision,
        language: question.language,
      });
    }
  });

  it("fails closed when any versioned execution identity changes", () => {
    const question = WORLDQUANT_ROLE_QUESTIONS.find(
      (item) => item.id === "worldquant-interval-stats-cpp",
    )!;
    expect(
      mockExecutionSpecForQuestion({
        ...question,
        version: question.version + 1,
      }),
    ).toBeNull();
    expect(
      mockExecutionSpecForQuestion({
        ...question,
        contentRevision: "changed-revision",
      }),
    ).toBeNull();
    expect(
      mockExecutionSpecForQuestion({
        ...question,
        execution: { specRevision: 99 },
      }),
    ).toBeNull();
    expect(mockExecutionSpecByQuestionId("worldquant-legacy-migration"))
      .toBeNull();
  });

  it("builds bounded plans without placing source in command arguments", () => {
    const marker = "UNTRUSTED_SOURCE_MARKER";
    const allowedCommands = new Set([
      "./candidate_app",
      "cmake",
      "ctest",
      "./build/feed_decoder_tests",
      "g++",
      "python3",
      "touch",
    ]);

    for (const spec of allMockExecutionSpecs()) {
      for (const suite of ["sample", "hidden"] as const) {
        const plan = spec.createPlan(marker, suite);
        expect(
          plan.files.some((file) => file.content === marker),
        ).toBe(true);
        expect(plan.build.length).toBeGreaterThan(0);
        expect(plan.tests.length).toBeGreaterThan(0);

        for (const file of [
          ...plan.files,
          ...plan.tests.flatMap((testCase) => testCase.files ?? []),
        ]) {
          expect(file.path).toMatch(/^work\//);
          expect(file.path).not.toContain("..");
        }
        for (const command of [
          ...plan.build,
          ...plan.tests.map((testCase) => testCase.command),
        ]) {
          expect(allowedCommands.has(command.cmd)).toBe(true);
          expect(command.args).not.toContain(marker);
          expect(command.timeoutMs).toBeGreaterThan(0);
          expect(command.timeoutMs).toBeLessThanOrEqual(15_000);
          expect(command.memoryBytes).toBeGreaterThan(0);
          expect(command.memoryBytes).toBeLessThanOrEqual(1024 ** 3);
        }
      }
    }
  });

  it("keeps sample validators deterministic for C++, Python and CMake", () => {
    const interval = mockExecutionSpecByQuestionId(
      "worldquant-interval-stats-cpp",
    )!.createPlan("candidate", "sample");
    expect(
      interval.tests[0].validate({
        exitCode: 0,
        stdout: "0 0 0 null null null null null\n",
        stderr: "",
      }).passed,
    ).toBe(true);
    expect(
      interval.tests[0].validate({
        exitCode: 0,
        stdout: "wrong",
        stderr: "",
      }).passed,
    ).toBe(false);

    const python = mockExecutionSpecByQuestionId(
      "worldquant-python-gap-audit",
    )!.createPlan("candidate", "sample");
    expect(
      python.tests[1].validate({
        exitCode: 0,
        stdout: "[]",
        stderr: "",
      }).passed,
    ).toBe(true);
    expect(
      python.tests[1].validate({
        exitCode: 0,
        stdout: "not-json",
        stderr: "",
      }).passed,
    ).toBe(false);

    const cmake = mockExecutionSpecByQuestionId(
      "worldquant-cmake-delivery",
    )!.createPlan("candidate", "sample");
    expect(
      cmake.tests[0].validate({
        exitCode: 0,
        stdout: "Total Tests: 1",
        stderr: "",
      }).passed,
    ).toBe(true);
    expect(
      cmake.tests[1].validate({
        exitCode: 1,
        stdout: "",
        stderr: "failed",
      }).passed,
    ).toBe(false);
  });
});
