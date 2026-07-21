export const questionStoreModes = ["repo", "shadow", "db"] as const;

export type QuestionStoreMode = (typeof questionStoreModes)[number];

export function parseQuestionStoreMode(
  value: string | undefined,
): QuestionStoreMode {
  const normalized = value?.trim().toLowerCase();
  if (!normalized) return "repo";

  if (questionStoreModes.includes(normalized as QuestionStoreMode)) {
    return normalized as QuestionStoreMode;
  }

  throw new QuestionStoreConfigurationError(
    `QUESTION_STORE must be one of: ${questionStoreModes.join(", ")}`,
  );
}

export function getQuestionStoreMode(): QuestionStoreMode {
  return parseQuestionStoreMode(process.env.QUESTION_STORE);
}

export class QuestionStoreConfigurationError extends Error {}
