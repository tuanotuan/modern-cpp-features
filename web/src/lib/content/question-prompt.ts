export type PromptQuestion = {
  prompt: string;
  code?: string | null;
};

const FENCED_CODE_BLOCK = /```(?:cpp|c\+\+|cc|cxx)?\s*[\s\S]*?```/gi;

export function displayQuestionPrompt(question: PromptQuestion) {
  if (!question.code || !question.prompt.includes("```")) {
    return question.prompt.trim();
  }

  return question.prompt
    .replace(FENCED_CODE_BLOCK, " ")
    .replace(/:\s+(Hãy|Giải thích|Cho biết|Nêu)\b/gi, ". $1")
    .replace(/\s+/g, " ")
    .trim();
}

