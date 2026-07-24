import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import {
  CodeExecutionBusyError,
  CodeExecutionConfigurationError,
  CodeExecutionIdempotencyConflictError,
  CodeExecutionQuotaExceededError,
  finishCodeExecution,
  mapCodeExecutionRpcError,
  parseCodeExecutionReservation,
  reserveCodeExecution,
} from "./admission.server";

const reservationId = "4a72364d-7209-4fa4-802b-d99cf5224f8c";
const userId = "d92b7048-7df0-4562-bf4d-3b3057f7282c";
const idempotencyKey = "23966699-ebc3-4b74-9a16-0ca48f4a47c7";

describe("code execution admission response mapping", () => {
  it("maps a new running reservation", () => {
    expect(
      parseCodeExecutionReservation({
        reservation_id: reservationId,
        status: "running",
        cached_result: null,
        is_new: true,
        purpose: "sample",
        job_count: 1,
        usage_date: "2026-07-24",
        lease_expires_at: "2026-07-24T12:02:00Z",
        jobs_used: 3,
        daily_limit: 20,
      }),
    ).toEqual({
      reservationId,
      status: "running",
      cachedResult: null,
      isNew: true,
      purpose: "sample",
      jobCount: 1,
      usageDate: "2026-07-24",
      leaseExpiresAt: "2026-07-24T12:02:00Z",
      jobsUsed: 3,
      dailyLimit: 20,
    });
  });

  it("returns a cached terminal result for an idempotent retry", () => {
    expect(
      parseCodeExecutionReservation({
        reservation_id: reservationId,
        status: "completed",
        cached_result: { ok: true, passed: 4 },
        is_new: false,
        purpose: "mock_report",
        job_count: 4,
        usage_date: "2026-07-24",
      }),
    ).toMatchObject({
      status: "completed",
      cachedResult: { ok: true, passed: 4 },
      isNew: false,
    });
  });

  it("maps quota, busy, and idempotency decisions to domain errors", () => {
    expect(() =>
      parseCodeExecutionReservation({
        status: "quota_exceeded",
        purpose: "sample",
        jobs_used: 20,
        daily_limit: 20,
      }),
    ).toThrow(CodeExecutionQuotaExceededError);

    expect(() =>
      parseCodeExecutionReservation({
        reservation_id: reservationId,
        status: "busy",
      }),
    ).toThrow(CodeExecutionBusyError);

    expect(() =>
      parseCodeExecutionReservation({
        reservation_id: reservationId,
        status: "idempotency_conflict",
      }),
    ).toThrow(CodeExecutionIdempotencyConflictError);
  });

  it("fails closed on malformed successful responses", () => {
    expect(() =>
      parseCodeExecutionReservation({
        reservation_id: reservationId,
        status: "completed",
        cached_result: null,
        is_new: false,
        purpose: "sample",
        job_count: 1,
        usage_date: "2026-07-24",
      }),
    ).toThrow(CodeExecutionConfigurationError);
  });
});

describe("code execution RPC error mapping", () => {
  it.each(["PGRST202", "42P01", "42703", "42883"])(
    "maps missing migration code %s to a configuration error",
    (code) => {
      expect(mapCodeExecutionRpcError({ code }).message).toContain(
        "migration is missing",
      );
    },
  );

  it("does not expose database error details", () => {
    expect(
      mapCodeExecutionRpcError({
        code: "XX000",
        message: "sensitive database detail",
      }).message,
    ).toBe("Code execution admission request failed");
  });
});

describe("service-only admission RPC calls", () => {
  it("binds a reservation to the authenticated user and source fingerprint", async () => {
    const rpc = vi.fn().mockResolvedValue({
      data: {
        reservation_id: reservationId,
        status: "running",
        cached_result: null,
        is_new: true,
        purpose: "sample",
        job_count: 1,
        usage_date: "2026-07-24",
        lease_expires_at: "2026-07-24T12:02:00Z",
      },
      error: null,
    });
    const client = {
      rpc,
    } as unknown as Parameters<typeof reserveCodeExecution>[0];

    await reserveCodeExecution(client, {
      userId,
      idempotencyKey,
      purpose: "sample",
      jobCount: 1,
      requestFingerprint: "a".repeat(64),
    });

    expect(rpc).toHaveBeenCalledWith("reserve_code_execution", {
      p_user_id: userId,
      p_idempotency_key: idempotencyKey,
      p_job_count: 1,
      p_purpose: "sample",
      p_request_fingerprint: "a".repeat(64),
    });
  });

  it("finishes only the selected user's reservation", async () => {
    const cachedResult = { ok: true };
    const rpc = vi.fn().mockResolvedValue({
      data: {
        reservation_id: reservationId,
        status: "completed",
        cached_result: cachedResult,
        is_new: true,
        purpose: "sample",
        job_count: 1,
        usage_date: "2026-07-24",
      },
      error: null,
    });
    const client = {
      rpc,
    } as unknown as Parameters<typeof finishCodeExecution>[0];

    await finishCodeExecution(client, {
      userId,
      reservationId,
      status: "completed",
      cachedResult,
    });

    expect(rpc).toHaveBeenCalledWith("finish_code_execution", {
      p_cached_result: cachedResult,
      p_reservation_id: reservationId,
      p_status: "completed",
      p_user_id: userId,
    });
  });
});
