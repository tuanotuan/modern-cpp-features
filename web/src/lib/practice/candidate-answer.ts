export const SCENARIO_EXPLANATION_MAX = 2200;
export const SCENARIO_CODE_MAX = 3200;

const LEGACY_CODE_RESPONSE_IDS = new Set([
  "cpp11-mutable-lambda-002",
  "cpp11-override-004",
  "cpp11-final-004",
]);

type AnswerableQuestion = {
  id?: string;
  type: string;
  responseMode?: "text" | "code";
  language?: "cpp" | "python" | "cmake";
};

export function requiresCodeAnswer(question: AnswerableQuestion) {
  return (
    question.responseMode === "code" ||
    (question.id ? LEGACY_CODE_RESPONSE_IDS.has(question.id) : false)
  );
}

export function buildCandidateAnswer(
  question: AnswerableQuestion,
  explanation: string,
  code: string,
) {
  if (!requiresCodeAnswer(question)) return explanation.trim();

  const trimmedCode = code.trim().slice(0, SCENARIO_CODE_MAX);
  if (!trimmedCode) return "";
  const trimmedExplanation = explanation
    .trim()
    .slice(0, SCENARIO_EXPLANATION_MAX);
  const language = question.language === "python"
    ? "Python"
    : question.language === "cmake"
      ? "CMake"
      : "C++";
  const fence = question.language === "python"
    ? "python"
    : question.language === "cmake"
      ? "cmake"
      : "cpp";
  return [
    `Thiết kế ${language} của ứng viên:`,
    `\`\`\`${fence}`,
    trimmedCode,
    "```",
    trimmedExplanation
      ? `Giải thích quyết định thiết kế:\n${trimmedExplanation}`
      : "Ứng viên chưa bổ sung phần giải thích.",
  ].join("\n");
}
