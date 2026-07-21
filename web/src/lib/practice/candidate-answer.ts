export const SCENARIO_EXPLANATION_MAX = 2200;
export const SCENARIO_CODE_MAX = 3200;

export function buildCandidateAnswer(
  question: { type: string },
  explanation: string,
  code: string,
) {
  if (question.type !== "scenario") return explanation.trim();

  const trimmedCode = code.trim().slice(0, SCENARIO_CODE_MAX);
  if (!trimmedCode) return "";
  const trimmedExplanation = explanation
    .trim()
    .slice(0, SCENARIO_EXPLANATION_MAX);
  return [
    "Thiết kế C++ của ứng viên:",
    "```cpp",
    trimmedCode,
    "```",
    trimmedExplanation
      ? `Giải thích quyết định thiết kế:\n${trimmedExplanation}`
      : "Ứng viên chưa bổ sung phần giải thích.",
  ].join("\n");
}

