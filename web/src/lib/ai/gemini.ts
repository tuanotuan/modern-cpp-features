import { GoogleGenAI } from "@google/genai";

import type { GeneratedLesson, Question } from "@/lib/content/schema";

import {
  coachFeedbackJsonSchema,
  coachFeedbackSchema,
  coachFollowUpResponseJsonSchema,
  coachFollowUpResponseSchema,
  normalizeCoachFeedback,
  type CoachFeedback,
  type CoachFollowUpMessage,
  type CoachFollowUpResponse,
} from "./contracts";
import { buildCoachFollowUpPrompt, buildCoachPrompt } from "./prompt";

const DEFAULT_GEMINI_FALLBACK_MODEL = "gemini-3.5-flash";

export type GeminiTokenUsage = {
  inputTokens: number;
  outputTokens: number;
  thoughtTokens: number;
  totalTokens: number;
};

export type GeminiStructuredResult<T> = {
  data: T;
  model: string;
  usage: GeminiTokenUsage;
};

export function isGeminiFallbackConfigured() {
  return Boolean(process.env.GEMINI_API_KEY) &&
    process.env.GEMINI_FALLBACK_ENABLED?.toLowerCase() !== "false";
}

export function geminiFallbackModel() {
  return (
    process.env.GEMINI_FALLBACK_MODEL ||
    process.env.GEMINI_MODEL ||
    process.env.AI_MODEL ||
    DEFAULT_GEMINI_FALLBACK_MODEL
  );
}

export async function evaluateWithGemini({
  question,
  lesson,
  candidateAnswer,
}: {
  question: Question;
  lesson: GeneratedLesson;
  candidateAnswer: string;
}): Promise<GeminiStructuredResult<CoachFeedback>> {
  const interaction = await geminiClient().interactions.create(
    {
      model: geminiFallbackModel(),
      store: false,
      system_instruction:
        "Bạn là senior C++ interviewer. Chấm công bằng, grounded vào rubric và notes; chỉ trả structured response được yêu cầu.",
      input: buildCoachPrompt({ question, lesson, candidateAnswer }),
      generation_config: {
        thinking_level: "high",
        temperature: 0.2,
        max_output_tokens: 3000,
      },
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: coachFeedbackJsonSchema,
      },
    },
    { timeout: 45_000, maxRetries: 1 },
  );

  if (!interaction.output_text) {
    throw new Error("Gemini returned empty coach feedback");
  }

  return {
    data: normalizeCoachFeedback(
      coachFeedbackSchema.parse(JSON.parse(interaction.output_text)),
    ),
    model: geminiFallbackModel(),
    usage: tokenUsage(interaction.usage),
  };
}

export async function answerCoachFollowUpWithGemini({
  question,
  lesson,
  candidateAnswer,
  feedback,
  messages,
}: {
  question: Question;
  lesson: GeneratedLesson;
  candidateAnswer: string;
  feedback: CoachFeedback;
  messages: CoachFollowUpMessage[];
}): Promise<GeminiStructuredResult<CoachFollowUpResponse>> {
  const interaction = await geminiClient().interactions.create(
    {
      model: geminiFallbackModel(),
      store: false,
      system_instruction:
        "Bạn là senior C++ interviewer đang giải thích lại feedback. Trả lời grounded, dễ hiểu và chỉ trả structured response được yêu cầu.",
      input: buildCoachFollowUpPrompt({
        question,
        lesson,
        candidateAnswer,
        feedback,
        messages,
      }),
      generation_config: {
        thinking_level: "high",
        temperature: 0.2,
        max_output_tokens: 2400,
      },
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: coachFollowUpResponseJsonSchema,
      },
    },
    { timeout: 45_000, maxRetries: 1 },
  );

  if (!interaction.output_text) {
    throw new Error("Gemini returned an empty follow-up response");
  }

  const data = coachFollowUpResponseSchema.parse(
    JSON.parse(interaction.output_text),
  );
  const allowedSourceIds = new Set(
    question.sources.map(({ sectionId }) => sectionId),
  );
  if (data.sourceSectionIds.some((id) => !allowedSourceIds.has(id))) {
    throw new Error("Gemini returned an unknown source section");
  }

  return {
    data,
    model: geminiFallbackModel(),
    usage: tokenUsage(interaction.usage),
  };
}

function geminiClient() {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new GeminiConfigurationError("GEMINI_API_KEY is missing");
  return new GoogleGenAI({ apiKey });
}

function tokenUsage(usage: {
  total_input_tokens?: number;
  total_output_tokens?: number;
  total_thought_tokens?: number;
  total_tokens?: number;
} | undefined): GeminiTokenUsage {
  const inputTokens = usage?.total_input_tokens ?? 0;
  const outputTokens = usage?.total_output_tokens ?? 0;
  const thoughtTokens = usage?.total_thought_tokens ?? 0;
  return {
    inputTokens,
    outputTokens,
    thoughtTokens,
    totalTokens:
      usage?.total_tokens ?? inputTokens + outputTokens + thoughtTokens,
  };
}

export class GeminiConfigurationError extends Error {}

