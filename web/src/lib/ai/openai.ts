import { createHash } from "node:crypto";

import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";

import type { GeneratedLesson, Question } from "@/lib/content/schema";

import {
  coachFeedbackSchema,
  coachFollowUpResponseSchema,
  type CoachFeedback,
  type CoachFollowUpMessage,
  type CoachFollowUpResponse,
} from "./contracts";
import { buildCoachFollowUpPrompt, buildCoachPrompt } from "./prompt";
import type { AiTokenUsage } from "./usage";

export const DEFAULT_LUNA_MODEL = "gpt-5.6-luna";
export const DEFAULT_TERRA_MODEL = "gpt-5.6-terra";

export type OpenAIStructuredResult<T> = {
  data: T;
  model: string;
  usage: AiTokenUsage;
};

export async function evaluateWithOpenAI({
  question,
  lesson,
  candidateAnswer,
  safetyIdentifier,
}: {
  question: Question;
  lesson: GeneratedLesson;
  candidateAnswer: string;
  safetyIdentifier: string;
}): Promise<OpenAIStructuredResult<CoachFeedback>> {
  const model = openAIModel("luna");
  const response = await openAIClient().responses.parse({
    model,
    store: false,
    safety_identifier: safetyIdentifier,
    instructions:
      "Bạn là senior C++ interviewer. Chấm công bằng, grounded vào rubric và notes; chỉ trả structured response được yêu cầu.",
    input: buildCoachPrompt({ question, lesson, candidateAnswer }),
    reasoning: { effort: "low" },
    max_output_tokens: 3000,
    text: {
      format: zodTextFormat(coachFeedbackSchema, "coach_feedback"),
      verbosity: "medium",
    },
  });

  return parsedResult(response, model, "OpenAI returned empty coach feedback");
}

export async function answerCoachFollowUpWithOpenAI({
  question,
  lesson,
  candidateAnswer,
  feedback,
  messages,
  safetyIdentifier,
}: {
  question: Question;
  lesson: GeneratedLesson;
  candidateAnswer: string;
  feedback: CoachFeedback;
  messages: CoachFollowUpMessage[];
  safetyIdentifier: string;
}): Promise<OpenAIStructuredResult<CoachFollowUpResponse>> {
  const model = openAIModel("terra");
  const response = await openAIClient().responses.parse({
    model,
    store: false,
    safety_identifier: safetyIdentifier,
    instructions:
      "Bạn là senior C++ interviewer đang giải thích lại feedback. Trả lời grounded, dễ hiểu và chỉ trả structured response được yêu cầu.",
    input: buildCoachFollowUpPrompt({
      question,
      lesson,
      candidateAnswer,
      feedback,
      messages,
    }),
    reasoning: { effort: "medium" },
    max_output_tokens: 2400,
    text: {
      format: zodTextFormat(coachFollowUpResponseSchema, "coach_follow_up"),
      verbosity: "medium",
    },
  });

  const result = parsedResult(
    response,
    model,
    "OpenAI returned an empty follow-up response",
  );
  const allowedSourceIds = new Set(
    question.sources.map(({ sectionId }) => sectionId),
  );
  if (result.data.sourceSectionIds.some((id) => !allowedSourceIds.has(id))) {
    throw new Error("OpenAI returned an unknown source section");
  }
  return result;
}

export function openAIClient() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new CoachConfigurationError("OPENAI_API_KEY is missing");
  return new OpenAI({ apiKey, timeout: 45_000, maxRetries: 1 });
}

export function openAIModel(tier: "luna" | "terra") {
  return tier === "terra"
    ? process.env.OPENAI_TERRA_MODEL || DEFAULT_TERRA_MODEL
    : process.env.OPENAI_LUNA_MODEL || DEFAULT_LUNA_MODEL;
}

export function safetyIdentifier(value: string) {
  return `cpp-recall-${createHash("sha256").update(value).digest("hex").slice(0, 32)}`;
}

function parsedResult<T>(
  response: {
    output_parsed: T | null;
    usage?: {
      input_tokens: number;
      output_tokens: number;
      input_tokens_details?: {
        cached_tokens?: number;
        cache_write_tokens?: number;
      };
    } | null;
  },
  model: string,
  emptyMessage: string,
): OpenAIStructuredResult<T> {
  if (!response.output_parsed) throw new Error(emptyMessage);
  return {
    data: response.output_parsed,
    model,
    usage: {
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
      cachedInputTokens:
        response.usage?.input_tokens_details?.cached_tokens ?? 0,
      cacheWriteTokens:
        response.usage?.input_tokens_details?.cache_write_tokens ?? 0,
    },
  };
}

export class CoachConfigurationError extends Error {}
