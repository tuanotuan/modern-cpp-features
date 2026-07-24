import "server-only";

import { createHash } from "node:crypto";
import { Writable } from "node:stream";

import { Sandbox, type SandboxUser } from "@vercel/sandbox";

import {
  CODE_RUNNER_MAX_OUTPUT_BYTES,
  codeExecutionResultSchema,
  type CodeExecutionResult,
  type CodeExecutionStatus,
} from "./contracts";
import {
  getCodeRunnerConfig,
  type CodeRunnerConfig,
} from "./config.server";
import {
  type ExecutionSuite,
  type MockExecutionSpec,
  type SandboxExecutionPlan,
  type SandboxPlanCommand,
} from "./execution-specs.server";

const SANDBOX_TIMEOUT_MS = 35_000;
const CREATE_TIMEOUT_MS = 15_000;
const STOP_TIMEOUT_MS = 8_000;
const MAX_PROCESSES = 32;
const MAX_OPEN_FILES = 64;
const MAX_FILE_BYTES = 32 * 1024 * 1024;

type CommandOutcome = {
  exitCode: number | null;
  durationMs: number;
  stdout: string;
  stderr: string;
  limit?: "time" | "memory" | "output";
};

export async function executeMockCode({
  spec,
  source,
  suite,
}: {
  spec: MockExecutionSpec;
  source: string;
  suite: ExecutionSuite;
}): Promise<CodeExecutionResult> {
  const config = getCodeRunnerConfig();
  const codeHash = createHash("sha256").update(source).digest("hex");
  const startedAt = Date.now();
  const plan = spec.createPlan(source, suite);
  let sandbox: (Sandbox & AsyncDisposable) | null = null;

  try {
    sandbox = await Sandbox.create({
      source: {
        type: "snapshot",
        snapshotId: config.snapshotId,
      },
      persistent: false,
      networkPolicy: "deny-all",
      resources: { vcpus: 1 },
      timeout: SANDBOX_TIMEOUT_MS,
      ports: [],
      tags: {
        app: "cpp-recall",
        purpose: suite,
      },
      signal: AbortSignal.timeout(CREATE_TIMEOUT_MS),
    });
    const candidate = await sandbox.createUser("candidate", {
      signal: AbortSignal.timeout(10_000),
    });
    await candidate.mkDir("work", {
      signal: AbortSignal.timeout(5_000),
    });
    await candidate.mkDir("tmp", {
      signal: AbortSignal.timeout(5_000),
    });
    await candidate.writeFiles(plan.files, {
      signal: AbortSignal.timeout(10_000),
    });

    return await executePlan({
      candidate,
      config,
      spec,
      suite,
      codeHash,
      plan,
      startedAt,
    });
  } catch (error) {
    console.error("Code sandbox infrastructure error", {
      questionId: spec.questionId,
      suite,
      name: error instanceof Error ? error.name : "UnknownError",
      detail:
        error instanceof Error
          ? sanitizeRunnerOutput(error.message, 500)
          : "Unknown sandbox error",
    });
    return makeResult({
      spec,
      suite,
      codeHash,
      config,
      startedAt,
      status: "sandbox_error",
      diagnostics:
        "Sandbox tạm thời không chạy được. Kết quả này không được dùng để trừ điểm.",
      totalTests: plan.tests.length,
    });
  } finally {
    if (sandbox) {
      try {
        await sandbox.stop({
          signal: AbortSignal.timeout(STOP_TIMEOUT_MS),
        });
      } catch (error) {
        console.error("Code sandbox cleanup failed", {
          name: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }
  }
}

async function executePlan({
  candidate,
  config,
  spec,
  suite,
  codeHash,
  plan,
  startedAt,
}: {
  candidate: SandboxUser;
  config: CodeRunnerConfig;
  spec: MockExecutionSpec;
  suite: ExecutionSuite;
  codeHash: string;
  plan: SandboxExecutionPlan;
  startedAt: number;
}) {
  const buildDiagnostics: string[] = [];
  for (const command of plan.build) {
    const outcome = await runLimitedCommand(candidate, command);
    const diagnostic = formatCommandDiagnostic(command, outcome);
    if (diagnostic) buildDiagnostics.push(diagnostic);
    if (outcome.limit || outcome.exitCode !== 0) {
      return makeResult({
        spec,
        suite,
        codeHash,
        config,
        startedAt,
        status:
          limitStatus(outcome.limit) ??
          classifyNonZeroExit(outcome) ??
          "compile_error",
        diagnostics: buildDiagnostics.join("\n\n"),
        output: outcome.stdout,
        totalTests: plan.tests.length,
      });
    }
  }

  let passedTests = 0;
  let sawRuntimeError = false;
  const cases: CodeExecutionResult["cases"] = [];
  const testOutput: string[] = [];
  for (const testCase of plan.tests) {
    if (testCase.files?.length) {
      await candidate.writeFiles(testCase.files, {
        signal: AbortSignal.timeout(10_000),
      });
    }
    const outcome = await runLimitedCommand(candidate, testCase.command);
    if (outcome.limit) {
      return makeResult({
        spec,
        suite,
        codeHash,
        config,
        startedAt,
        status: limitStatus(outcome.limit) ?? "runtime_error",
        diagnostics: buildDiagnostics.join("\n\n"),
        output: formatTestOutput(testCase.name, outcome),
        passedTests,
        totalTests: plan.tests.length,
        cases,
      });
    }

    const assessment = testCase.validate({
      exitCode: outcome.exitCode ?? -1,
      stdout: outcome.stdout,
      stderr: outcome.stderr,
    });
    if (assessment.passed) passedTests += 1;
    if (
      !assessment.passed &&
      testCase.command.cmd !== "ctest" &&
      isRuntimeCrash(outcome)
    ) {
      sawRuntimeError = true;
    }
    if (suite === "sample") {
      cases.push({
        name: testCase.name,
        passed: assessment.passed,
        message: assessment.message,
      });
    }
    if (!assessment.passed) {
      testOutput.push(formatTestOutput(testCase.name, outcome));
    }
  }

  return makeResult({
    spec,
    suite,
    codeHash,
    config,
    startedAt,
    status:
      passedTests === plan.tests.length
        ? "passed"
        : sawRuntimeError
          ? "runtime_error"
          : "tests_failed",
    diagnostics: buildDiagnostics.join("\n\n"),
    output: testOutput.join("\n\n"),
    passedTests,
    totalTests: plan.tests.length,
    cases,
  });
}

async function runLimitedCommand(
  candidate: SandboxUser,
  command: SandboxPlanCommand,
): Promise<CommandOutcome> {
  const controller = new AbortController();
  const output = new OutputBudget(
    CODE_RUNNER_MAX_OUTPUT_BYTES,
    controller,
  );
  const startedAt = Date.now();

  try {
    const result = await candidate.runCommand({
      cmd: "/usr/bin/prlimit",
      args: [
        `--as=${command.memoryBytes}`,
        `--cpu=${Math.max(1, Math.ceil(command.timeoutMs / 1000))}`,
        `--nproc=${MAX_PROCESSES}`,
        `--nofile=${MAX_OPEN_FILES}`,
        `--fsize=${MAX_FILE_BYTES}`,
        "--core=0",
        "--",
        command.cmd,
        ...command.args,
      ],
      cwd: command.cwd ?? `${candidate.homeDir}/work`,
      env: {
        HOME: candidate.homeDir,
        LANG: "C.UTF-8",
        LC_ALL: "C.UTF-8",
        PATH: "/usr/local/bin:/usr/bin:/bin",
        PYTHONHASHSEED: "0",
        TMPDIR: `${candidate.homeDir}/tmp`,
      },
      timeoutMs: command.timeoutMs,
      signal: controller.signal,
      stdout: output.stdout,
      stderr: output.stderr,
    });
    const outcome = {
      exitCode: result.exitCode,
      durationMs: result.durationMs ?? Date.now() - startedAt,
      stdout: output.stdoutText(),
      stderr: output.stderrText(),
    } satisfies CommandOutcome;
    return {
      ...outcome,
      limit: classifyOutcomeLimit(outcome, command.timeoutMs),
    };
  } catch (error) {
    const elapsed = Date.now() - startedAt;
    if (!output.exceeded && !isTimeoutError(error)) {
      const combined = `${output.stdoutText()}\n${output.stderrText()}`;
      if (!isMemoryMessage(combined)) throw error;
    }
    return {
      exitCode: null,
      durationMs: elapsed,
      stdout: output.stdoutText(),
      stderr: output.stderrText(),
      limit: output.exceeded
        ? "output"
        : isTimeoutError(error) || elapsed >= command.timeoutMs - 100
          ? "time"
          : isMemoryMessage(
                `${output.stdoutText()}\n${output.stderrText()}`,
              )
            ? "memory"
            : undefined,
    };
  }
}

class OutputBudget {
  private bytes = 0;
  private readonly stdoutChunks: Buffer[] = [];
  private readonly stderrChunks: Buffer[] = [];
  exceeded = false;
  readonly stdout: Writable;
  readonly stderr: Writable;

  constructor(
    private readonly limit: number,
    private readonly controller: AbortController,
  ) {
    this.stdout = this.createSink(this.stdoutChunks);
    this.stderr = this.createSink(this.stderrChunks);
  }

  stdoutText() {
    return sanitizeRunnerOutput(
      Buffer.concat(this.stdoutChunks).toString("utf8"),
      16_000,
    );
  }

  stderrText() {
    return sanitizeRunnerOutput(
      Buffer.concat(this.stderrChunks).toString("utf8"),
      16_000,
    );
  }

  private createSink(target: Buffer[]) {
    return new Writable({
      write: (chunk: Buffer | string, _encoding, callback) => {
        const buffer = Buffer.isBuffer(chunk)
          ? chunk
          : Buffer.from(chunk);
        const remaining = Math.max(0, this.limit - this.bytes);
        if (remaining > 0) target.push(buffer.subarray(0, remaining));
        this.bytes += buffer.length;
        if (this.bytes > this.limit && !this.exceeded) {
          this.exceeded = true;
          this.controller.abort(
            new Error("code_runner_output_limit"),
          );
        }
        callback();
      },
    });
  }
}

export function sanitizeRunnerOutput(value: string, maxChars: number) {
  const withoutAnsi = value.replace(
    /\u001B(?:[@-Z\\-_]|\[[0-?]*[ -/]*[@-~])/g,
    "",
  );
  const withoutControls = withoutAnsi
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "")
    .replaceAll("/home/candidate/work/", "")
    .replaceAll("/home/candidate/", "")
    .replaceAll("/vercel/sandbox/", "");
  if (withoutControls.length <= maxChars) return withoutControls;
  const suffix = "\n… output đã được rút gọn";
  return `${withoutControls.slice(
    0,
    Math.max(0, maxChars - suffix.length),
  )}${suffix}`;
}

export function classifyOutcomeLimit(
  outcome: Pick<
    CommandOutcome,
    "exitCode" | "durationMs" | "stdout" | "stderr"
  >,
  timeoutMs: number,
): CommandOutcome["limit"] {
  const combined = `${outcome.stdout}\n${outcome.stderr}`;
  if (
    outcome.durationMs >= timeoutMs - 100 &&
    (outcome.exitCode === 124 ||
      outcome.exitCode === 137 ||
      outcome.exitCode === null)
  ) {
    return "time";
  }
  if (isMemoryMessage(combined)) return "memory";
  return undefined;
}

function classifyNonZeroExit(
  outcome: CommandOutcome,
): CodeExecutionStatus | null {
  if (isMemoryMessage(`${outcome.stdout}\n${outcome.stderr}`)) {
    return "memory_limit";
  }
  return null;
}

function limitStatus(
  limit: CommandOutcome["limit"],
): CodeExecutionStatus | null {
  if (limit === "time") return "time_limit";
  if (limit === "memory") return "memory_limit";
  if (limit === "output") return "output_limit";
  return null;
}

function isRuntimeCrash(outcome: CommandOutcome) {
  return (
    outcome.exitCode === null ||
    outcome.exitCode >= 128 ||
    /(?:Traceback \(most recent call last\)|Segmentation fault|terminate called)/i.test(
      `${outcome.stdout}\n${outcome.stderr}`,
    )
  );
}

function isMemoryMessage(value: string) {
  return /(?:std::bad_alloc|MemoryError|cannot allocate memory|out of memory)/i.test(
    value,
  );
}

function isTimeoutError(error: unknown) {
  if (!(error instanceof Error)) return false;
  return (
    error.name === "TimeoutError" ||
    error.name === "AbortError" ||
    /timed?\s*out|timeout/i.test(error.message)
  );
}

function formatCommandDiagnostic(
  command: SandboxPlanCommand,
  outcome: CommandOutcome,
) {
  const body = [outcome.stderr, outcome.stdout]
    .filter(Boolean)
    .join("\n")
    .trim();
  if (!body && outcome.exitCode === 0) return "";
  return `[${command.phase}] exit=${outcome.exitCode ?? "killed"} · ${outcome.durationMs}ms${
    body ? `\n${body}` : ""
  }`;
}

function formatTestOutput(name: string, outcome: CommandOutcome) {
  const body = [outcome.stderr, outcome.stdout]
    .filter(Boolean)
    .join("\n")
    .trim();
  return `[${name}] exit=${outcome.exitCode ?? "killed"}${
    body ? `\n${body}` : ""
  }`;
}

function makeResult({
  spec,
  suite,
  codeHash,
  config,
  startedAt,
  status,
  passedTests = 0,
  totalTests = 0,
  diagnostics = "",
  output = "",
  cases = [],
}: {
  spec: MockExecutionSpec;
  suite: ExecutionSuite;
  codeHash: string;
  config: CodeRunnerConfig;
  startedAt: number;
  status: CodeExecutionStatus;
  passedTests?: number;
  totalTests?: number;
  diagnostics?: string;
  output?: string;
  cases?: CodeExecutionResult["cases"];
}) {
  return codeExecutionResultSchema.parse({
    suite,
    codeHash,
    specRevision: spec.revision,
    language: spec.language,
    status,
    passedTests,
    totalTests,
    durationMs: Date.now() - startedAt,
    diagnostics: sanitizeRunnerOutput(diagnostics, 16_000),
    output: sanitizeRunnerOutput(output, 8_000),
    cases: suite === "sample" ? cases : [],
    toolchain: config.toolchainLabel,
    completedAt: new Date().toISOString(),
  });
}
