import { z } from "zod";

import {
  mockInterviewSetIds,
  WORLDQUANT_PROFILE_VERSION,
} from "@/lib/mock-interview/profile";

export const CODE_RUNNER_MAX_SOURCE_BYTES = 8 * 1024;
export const CODE_RUNNER_MAX_OUTPUT_BYTES = 64 * 1024;

export const codeExecutionStatusSchema = z.enum([
  "passed",
  "tests_failed",
  "compile_error",
  "runtime_error",
  "time_limit",
  "memory_limit",
  "output_limit",
  "sandbox_error",
]);

export type CodeExecutionStatus = z.infer<
  typeof codeExecutionStatusSchema
>;

export const codeExecutionCaseSchema = z.object({
  name: z.string().trim().min(1).max(120),
  passed: z.boolean(),
  message: z.string().trim().max(500).optional(),
});

export const codeExecutionResultSchema = z.object({
  suite: z.enum(["sample", "hidden"]),
  codeHash: z.string().regex(/^[a-f0-9]{64}$/),
  specRevision: z.number().int().positive(),
  language: z.enum(["cpp", "python", "cmake"]),
  status: codeExecutionStatusSchema,
  passedTests: z.number().int().nonnegative(),
  totalTests: z.number().int().nonnegative(),
  durationMs: z.number().int().nonnegative(),
  diagnostics: z.string().max(16_000),
  output: z.string().max(8_000),
  cases: z.array(codeExecutionCaseSchema).max(10),
  toolchain: z.string().trim().min(1).max(120),
  completedAt: z.string().datetime(),
});

export type CodeExecutionResult = z.infer<
  typeof codeExecutionResultSchema
>;

export const mockCodeRunRequestSchema = z
  .object({
    idempotencyKey: z.string().uuid(),
    sessionId: z.string().uuid(),
    profileId: z.literal("worldquant-tick-data-engineer"),
    profileVersion: z.literal(WORLDQUANT_PROFILE_VERSION),
    setId: z.enum(mockInterviewSetIds),
    setVersion: z.number().int().positive(),
    sourceRevision: z.string().regex(/^[a-f0-9]{40,64}$/),
    questionId: z
      .string()
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
      .max(120),
    origin: z.literal("role_profile"),
    questionVersion: z.number().int().positive(),
    contentRevision: z.string().trim().min(1).max(128),
    code: z.string().max(CODE_RUNNER_MAX_SOURCE_BYTES),
  })
  .strict();

export type MockCodeRunRequest = z.infer<
  typeof mockCodeRunRequestSchema
>;

export function isSourceWithinByteLimit(source: string) {
  return (
    !source.includes("\0") &&
    new TextEncoder().encode(source).byteLength <= CODE_RUNNER_MAX_SOURCE_BYTES
  );
}
