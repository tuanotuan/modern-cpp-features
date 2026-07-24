import "server-only";

import {
  createClient,
  type SupabaseClient,
} from "@supabase/supabase-js";

export const CODE_EXECUTION_RESULT_MAX_BYTES = 128 * 1024;

export type CodeExecutionPurpose = "sample" | "mock_report";
export type CodeExecutionReservationStatus =
  | "running"
  | "completed"
  | "failed";

export type CodeExecutionReservation = {
  reservationId: string;
  status: CodeExecutionReservationStatus;
  cachedResult: Record<string, unknown> | null;
  isNew: boolean;
  purpose: CodeExecutionPurpose;
  jobCount: number;
  usageDate: string;
  leaseExpiresAt: string | null;
  jobsUsed: number | null;
  dailyLimit: number | null;
};

type RpcErrorLike = {
  code?: string | null;
  message?: string | null;
};

export class CodeExecutionQuotaExceededError extends Error {
  constructor(
    readonly purpose: CodeExecutionPurpose,
    readonly jobsUsed: number | null,
    readonly dailyLimit: number | null,
  ) {
    super("Daily code execution quota reached");
    this.name = "CodeExecutionQuotaExceededError";
  }
}

export class CodeExecutionBusyError extends Error {
  constructor(readonly reservationId: string | null) {
    super("Another code execution is already running");
    this.name = "CodeExecutionBusyError";
  }
}

export class CodeExecutionIdempotencyConflictError extends Error {
  constructor() {
    super("Idempotency key was reused with different execution parameters");
    this.name = "CodeExecutionIdempotencyConflictError";
  }
}

export class CodeExecutionConfigurationError extends Error {
  constructor(message = "Code execution admission is not configured") {
    super(message);
    this.name = "CodeExecutionConfigurationError";
  }
}

export class CodeExecutionReservationNotFoundError extends Error {
  constructor() {
    super("Code execution reservation was not found");
    this.name = "CodeExecutionReservationNotFoundError";
  }
}

export function createCodeExecutionAdminClient() {
  const url =
    process.env.SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  const runnerSecretKey =
    process.env.CODE_RUNNER_SUPABASE_SECRET_KEY?.trim();
  if (!url || !runnerSecretKey) {
    throw new CodeExecutionConfigurationError(
      "Code execution requires its dedicated Supabase secret key",
    );
  }
  return createClient(url, runnerSecretKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
  });
}

export function mapCodeExecutionRpcError(
  error: RpcErrorLike,
): CodeExecutionConfigurationError {
  const code = error.code?.trim() ?? "";
  const missingMigrationCodes = new Set([
    "PGRST202",
    "42P01",
    "42703",
    "42883",
  ]);
  if (missingMigrationCodes.has(code)) {
    return new CodeExecutionConfigurationError(
      "Code execution admission migration is missing",
    );
  }
  return new CodeExecutionConfigurationError(
    "Code execution admission request failed",
  );
}

export function parseCodeExecutionReservation(
  data: unknown,
  requestedPurpose?: CodeExecutionPurpose,
): CodeExecutionReservation {
  if (!isRecord(data)) {
    throw new CodeExecutionConfigurationError(
      "Unexpected code execution admission response",
    );
  }

  const status = readString(data.status);
  const reservationId = readNullableString(data.reservation_id);
  const purpose = readPurpose(data.purpose) ?? requestedPurpose ?? null;
  const jobsUsed = readNullableInteger(data.jobs_used);
  const dailyLimit = readNullableInteger(data.daily_limit);

  if (status === "quota_exceeded") {
    if (!purpose) {
      throw new CodeExecutionConfigurationError(
        "Code execution quota response is missing its purpose",
      );
    }
    throw new CodeExecutionQuotaExceededError(
      purpose,
      jobsUsed,
      dailyLimit,
    );
  }
  if (status === "busy") {
    throw new CodeExecutionBusyError(reservationId);
  }
  if (status === "idempotency_conflict") {
    throw new CodeExecutionIdempotencyConflictError();
  }
  if (status === "not_found") {
    throw new CodeExecutionReservationNotFoundError();
  }
  if (
    status !== "running"
    && status !== "completed"
    && status !== "failed"
  ) {
    throw new CodeExecutionConfigurationError(
      "Unknown code execution admission status",
    );
  }
  if (!reservationId || !isUuid(reservationId) || !purpose) {
    throw new CodeExecutionConfigurationError(
      "Code execution reservation identity is missing",
    );
  }

  const jobCount = readPositiveInteger(data.job_count);
  const usageDate = readString(data.usage_date);
  const isNew = data.is_new;
  const leaseExpiresAt = readNullableString(data.lease_expires_at);
  if (
    !("cached_result" in data)
    || (
      data.cached_result !== null
      && !isRecord(data.cached_result)
    )
  ) {
    throw new CodeExecutionConfigurationError(
      "Code execution cached result is malformed",
    );
  }
  const cachedResult = data.cached_result;
  if (
    jobCount === null
    || !isIsoDate(usageDate)
    || typeof isNew !== "boolean"
    || (status === "running" && cachedResult !== null)
    || (status !== "running" && cachedResult === null)
  ) {
    throw new CodeExecutionConfigurationError(
      "Code execution reservation response is malformed",
    );
  }

  return {
    reservationId,
    status,
    cachedResult,
    isNew,
    purpose,
    jobCount,
    usageDate,
    leaseExpiresAt,
    jobsUsed,
    dailyLimit,
  };
}

export async function reserveCodeExecution(
  client: SupabaseClient,
  input: {
    userId: string;
    idempotencyKey: string;
    purpose: CodeExecutionPurpose;
    jobCount: number;
    requestFingerprint: string;
  },
): Promise<CodeExecutionReservation> {
  assertReservationInput(input);
  const { data, error } = await client.rpc("reserve_code_execution", {
    p_user_id: input.userId,
    p_idempotency_key: input.idempotencyKey,
    p_job_count: input.jobCount,
    p_purpose: input.purpose,
    p_request_fingerprint: input.requestFingerprint,
  });
  if (error) throw mapCodeExecutionRpcError(error);
  return parseCodeExecutionReservation(data, input.purpose);
}

export async function finishCodeExecution(
  client: SupabaseClient,
  input: {
    userId: string;
    reservationId: string;
    status: Exclude<CodeExecutionReservationStatus, "running">;
    cachedResult: Record<string, unknown>;
  },
): Promise<CodeExecutionReservation> {
  if (!isUuid(input.userId)) {
    throw new CodeExecutionConfigurationError(
      "A valid user UUID is required",
    );
  }
  if (!isUuid(input.reservationId)) {
    throw new CodeExecutionConfigurationError(
      "A valid reservation UUID is required",
    );
  }
  const serializedBytes = new TextEncoder().encode(
    JSON.stringify(input.cachedResult),
  ).byteLength;
  if (serializedBytes > CODE_EXECUTION_RESULT_MAX_BYTES) {
    throw new CodeExecutionConfigurationError(
      "Code execution result exceeds 128 KiB",
    );
  }

  const { data, error } = await client.rpc("finish_code_execution", {
    p_cached_result: input.cachedResult,
    p_reservation_id: input.reservationId,
    p_status: input.status,
    p_user_id: input.userId,
  });
  if (error) throw mapCodeExecutionRpcError(error);
  return parseCodeExecutionReservation(data);
}

function assertReservationInput(input: {
  userId: string;
  idempotencyKey: string;
  purpose: CodeExecutionPurpose;
  jobCount: number;
  requestFingerprint: string;
}) {
  if (!isUuid(input.userId)) {
    throw new CodeExecutionConfigurationError(
      "A valid user UUID is required",
    );
  }
  if (!isUuid(input.idempotencyKey)) {
    throw new CodeExecutionIdempotencyConflictError();
  }
  if (!/^[a-f0-9]{64}$/.test(input.requestFingerprint)) {
    throw new CodeExecutionIdempotencyConflictError();
  }
  const limit = input.purpose === "sample" ? 20 : 12;
  if (
    !Number.isInteger(input.jobCount)
    || input.jobCount <= 0
    || input.jobCount > limit
  ) {
    throw new CodeExecutionConfigurationError(
      "Code execution job count is invalid",
    );
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" ? value : null;
}

function readNullableString(value: unknown) {
  return value === null || value === undefined ? null : readString(value);
}

function readPurpose(value: unknown): CodeExecutionPurpose | null {
  return value === "sample" || value === "mock_report" ? value : null;
}

function readPositiveInteger(value: unknown) {
  return Number.isInteger(value) && Number(value) > 0 ? Number(value) : null;
}

function readNullableInteger(value: unknown) {
  return value === null || value === undefined
    ? null
    : Number.isInteger(value)
      ? Number(value)
      : null;
}

function isIsoDate(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function isUuid(value: string | null): value is string {
  return Boolean(
    value
    && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
      .test(value)
    && value !== "00000000-0000-0000-0000-000000000000",
  );
}
