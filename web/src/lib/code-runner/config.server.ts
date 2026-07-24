import "server-only";

export type CodeRunnerConfig = {
  snapshotId: string;
  toolchainLabel: string;
};

export function getCodeRunnerConfig(): CodeRunnerConfig {
  if (process.env.CODE_RUNNER_ENABLED?.trim().toLowerCase() !== "true") {
    throw new CodeRunnerConfigurationError(
      "CODE_RUNNER_ENABLED must be true",
    );
  }
  const snapshotId = process.env.CODE_RUNNER_SNAPSHOT_ID?.trim();
  if (!snapshotId || snapshotId.length > 200) {
    throw new CodeRunnerConfigurationError(
      "CODE_RUNNER_SNAPSHOT_ID is required",
    );
  }
  if (
    !process.env.CODE_RUNNER_SUPABASE_SECRET_KEY?.trim() ||
    !(
      process.env.SUPABASE_URL?.trim() ||
      process.env.NEXT_PUBLIC_SUPABASE_URL?.trim()
    )
  ) {
    throw new CodeRunnerConfigurationError(
      "Dedicated Supabase runner credentials are required",
    );
  }
  return {
    snapshotId,
    toolchainLabel:
      process.env.CODE_RUNNER_TOOLCHAIN_LABEL?.trim().slice(0, 120) ||
      "Recall sandbox v1",
  };
}

export function isCodeRunnerConfigured() {
  try {
    getCodeRunnerConfig();
    return true;
  } catch {
    return false;
  }
}

export class CodeRunnerConfigurationError extends Error {}
