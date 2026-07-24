import { createHash } from "node:crypto";

import {
  CodeExecutionBusyError,
  CodeExecutionConfigurationError,
  CodeExecutionIdempotencyConflictError,
  CodeExecutionQuotaExceededError,
  createCodeExecutionAdminClient,
  finishCodeExecution,
  reserveCodeExecution,
} from "@/lib/code-runner/admission.server";
import {
  codeExecutionResultSchema,
  isSourceWithinByteLimit,
  mockCodeRunRequestSchema,
} from "@/lib/code-runner/contracts";
import {
  CodeRunnerConfigurationError,
  getCodeRunnerConfig,
} from "@/lib/code-runner/config.server";
import {
  mockExecutionSpecForQuestion,
} from "@/lib/code-runner/execution-specs.server";
import { executeMockCode } from "@/lib/code-runner/vercel-sandbox.server";
import {
  worldQuantMockSetById,
  WORLDQUANT_ROLE_QUESTIONS,
} from "@/lib/mock-interview/profile";
import { isAllowedPracticeUser } from "@/lib/supabase/authorization";
import { isSupabaseConfigured } from "@/lib/supabase/config";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const runtime = "nodejs";
export const maxDuration = 90;

const MAX_REQUEST_BYTES = 20 * 1024;

export async function POST(request: Request) {
  if (!isSupabaseConfigured()) {
    return errorResponse(
      503,
      "Supabase chưa được cấu hình nên runner bị khóa an toàn.",
      "runner_not_configured",
    );
  }
  if (
    !request.headers
      .get("content-type")
      ?.toLowerCase()
      .startsWith("application/json")
  ) {
    return errorResponse(
      415,
      "Runner chỉ nhận application/json.",
      "unsupported_media_type",
    );
  }
  const declaredLength = Number(
    request.headers.get("content-length") ?? "0",
  );
  if (
    Number.isFinite(declaredLength) &&
    declaredLength > MAX_REQUEST_BYTES
  ) {
    return errorResponse(
      413,
      "Source code vượt giới hạn 8 KiB.",
      "request_too_large",
    );
  }

  const rawBody = await request.text();
  if (new TextEncoder().encode(rawBody).byteLength > MAX_REQUEST_BYTES) {
    return errorResponse(
      413,
      "Source code vượt giới hạn 8 KiB.",
      "request_too_large",
    );
  }
  let body: unknown;
  try {
    body = JSON.parse(rawBody);
  } catch {
    return errorResponse(400, "JSON không hợp lệ.", "invalid_json");
  }
  const parsed = mockCodeRunRequestSchema.safeParse(body);
  if (!parsed.success || !isSourceWithinByteLimit(parsed.data.code)) {
    return errorResponse(
      400,
      "Request chạy code không hợp lệ hoặc source vượt giới hạn.",
      "invalid_request",
    );
  }

  const supabase = await createSupabaseServerClient();
  const { data: authData, error: authError } =
    await supabase.auth.getUser();
  if (authError || !authData.user) {
    return errorResponse(
      401,
      "Đăng nhập GitHub để chạy code.",
      "authentication_required",
    );
  }
  if (!isAllowedPracticeUser(authData.user)) {
    return errorResponse(
      403,
      "Tài khoản này không có quyền dùng runner.",
      "forbidden",
    );
  }

  const target = resolveRunTarget(parsed.data);
  if (!target.ok) return target.response;

  let admissionClient: ReturnType<
    typeof createCodeExecutionAdminClient
  >;
  let runnerConfig: ReturnType<typeof getCodeRunnerConfig>;
  try {
    admissionClient = createCodeExecutionAdminClient();
    runnerConfig = getCodeRunnerConfig();
  } catch (error) {
    return handleRunError(error);
  }
  const requestFingerprint = createHash("sha256")
    .update(
      JSON.stringify({
        codeHash: createHash("sha256")
          .update(parsed.data.code)
          .digest("hex"),
        contentRevision: parsed.data.contentRevision,
        language: target.spec.language,
        questionId: parsed.data.questionId,
        questionVersion: parsed.data.questionVersion,
        specRevision: target.spec.revision,
        toolchainSnapshotHash: createHash("sha256")
          .update(runnerConfig.snapshotId)
          .digest("hex"),
      }),
    )
    .digest("hex");
  let reservationId: string | null = null;
  try {
    const reservation = await reserveCodeExecution(admissionClient, {
      userId: authData.user.id,
      idempotencyKey: parsed.data.idempotencyKey,
      purpose: "sample",
      jobCount: 1,
      requestFingerprint,
    });
    reservationId = reservation.reservationId;

    if (reservation.status !== "running") {
      const cached = parseCachedResult(
        reservation.cachedResult,
        target.spec,
        parsed.data.code,
      );
      if (cached) return Response.json({ ok: true, result: cached });
      return errorResponse(
        409,
        "Lượt chạy cũ đã kết thúc nhưng cache không còn hợp lệ. Hãy chạy lại.",
        "cached_result_invalid",
      );
    }
    if (!reservation.isNew) {
      return errorResponse(
        409,
        "Lượt chạy này vẫn đang xử lý. Chờ một chút rồi nhấn lại.",
        "run_in_progress",
      );
    }

    const result = await executeMockCode({
      spec: target.spec,
      source: parsed.data.code,
      suite: "sample",
    });
    await finishCodeExecution(admissionClient, {
      userId: authData.user.id,
      reservationId,
      status: "completed",
      cachedResult: { ok: true, result },
    });
    return Response.json({ ok: true, result });
  } catch (error) {
    if (reservationId) {
      await finishCodeExecution(admissionClient, {
        userId: authData.user.id,
        reservationId,
        status: "failed",
        cachedResult: {
          ok: false,
          code: publicErrorCode(error),
        },
      }).catch(() => undefined);
    }
    return handleRunError(error);
  }
}

function resolveRunTarget(
  request: ReturnType<typeof mockCodeRunRequestSchema.parse>,
):
  | {
      ok: true;
      spec: NonNullable<
        ReturnType<typeof mockExecutionSpecForQuestion>
      >;
    }
  | { ok: false; response: Response } {
  const mockSet = worldQuantMockSetById(request.setId);
  if (
    !mockSet ||
    mockSet.version !== request.setVersion ||
    !mockSet.questionIds.some(
      (questionId) => questionId === request.questionId,
    )
  ) {
    return {
      ok: false,
      response: errorResponse(
        409,
        "Bộ đề đã thay đổi. Hãy tạo buổi mock mới.",
        "set_changed",
      ),
    };
  }
  const question = WORLDQUANT_ROLE_QUESTIONS.find(
    (item) => item.id === request.questionId,
  );
  if (
    !question ||
    question.origin !== request.origin ||
    question.version !== request.questionVersion ||
    question.contentRevision !== request.contentRevision
  ) {
    return {
      ok: false,
      response: errorResponse(
        409,
        "Câu hỏi hoặc execution spec đã đổi. Hãy tạo buổi mock mới.",
        "content_changed",
      ),
    };
  }
  const spec = mockExecutionSpecForQuestion(question);
  if (!spec) {
    return {
      ok: false,
      response: errorResponse(
        422,
        "Câu này không có test harness an toàn để chạy.",
        "not_runnable",
      ),
    };
  }
  return { ok: true, spec };
}

function parseCachedResult(
  value: Record<string, unknown> | null,
  spec: NonNullable<ReturnType<typeof mockExecutionSpecForQuestion>>,
  source: string,
) {
  if (!value || value.ok !== true) return null;
  const parsed = codeExecutionResultSchema.safeParse(value.result);
  if (!parsed.success) return null;
  const result = parsed.data;
  return result.suite === "sample" &&
    result.codeHash ===
      createHash("sha256").update(source).digest("hex") &&
    result.specRevision === spec.revision &&
    result.language === spec.language
    ? result
    : null;
}

function handleRunError(error: unknown) {
  if (error instanceof CodeExecutionQuotaExceededError) {
    return errorResponse(
      429,
      "Đã hết quota chạy sample hôm nay. Quota reset lúc 00:00 giờ Việt Nam.",
      "daily_quota_exceeded",
    );
  }
  if (error instanceof CodeExecutionBusyError) {
    return errorResponse(
      409,
      "Một lượt code khác đang chạy. Chờ nó kết thúc rồi thử lại.",
      "runner_busy",
    );
  }
  if (error instanceof CodeExecutionIdempotencyConflictError) {
    return errorResponse(
      409,
      "Idempotency key đã được dùng cho request khác.",
      "idempotency_conflict",
    );
  }
  if (
    error instanceof CodeExecutionConfigurationError ||
    error instanceof CodeRunnerConfigurationError
  ) {
    return errorResponse(
      503,
      "Code runner chưa được cấu hình đầy đủ.",
      "runner_not_configured",
    );
  }
  console.error("Mock code execution failed", {
    name: error instanceof Error ? error.name : "UnknownError",
  });
  return errorResponse(
    502,
    "Sandbox tạm thời không chạy được. Thử lại sau.",
    "sandbox_failed",
  );
}

function publicErrorCode(error: unknown) {
  if (error instanceof CodeRunnerConfigurationError) {
    return "runner_not_configured";
  }
  if (error instanceof CodeExecutionConfigurationError) {
    return "admission_not_configured";
  }
  return "sandbox_failed";
}

function errorResponse(status: number, error: string, code: string) {
  return Response.json({ ok: false, error, code }, { status });
}
