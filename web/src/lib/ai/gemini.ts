import { GoogleGenAI } from "@google/genai";

import type { GeneratedLesson, Question } from "@/lib/content/schema";

import {
  coachFeedbackJsonSchema,
  coachFeedbackSchema,
  coachFollowUpResponseJsonSchema,
  coachFollowUpResponseSchema,
  type CoachFeedback,
  type CoachFollowUpMessage,
  type CoachFollowUpResponse,
} from "./contracts";
import { buildCoachFollowUpPrompt, buildCoachPrompt } from "./prompt";

const DEFAULT_MODEL = "gemini-3-flash-preview";

export async function evaluateWithGemini({
  question,
  lesson,
  candidateAnswer,
}: {
  question: Question;
  lesson: GeneratedLesson;
  candidateAnswer: string;
}): Promise<CoachFeedback> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new CoachConfigurationError("GEMINI_API_KEY is missing");

  const model = process.env.AI_MODEL || DEFAULT_MODEL;
  const client = new GoogleGenAI({ apiKey });
  const interaction = await client.interactions.create(
    {
      model,
      store: false,
      system_instruction:
        "Bạn là senior C++ interviewer. Hãy chấm công bằng, grounded vào rubric và notes; trả về duy nhất structured response đã yêu cầu.",
      input: buildCoachPrompt({ question, lesson, candidateAnswer }),
      generation_config: {
        thinking_level: "high",
        temperature: 0.2,
        max_output_tokens: 2400,
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
    throw new Error("Gemini returned an empty response");
  }

  return coachFeedbackSchema.parse(JSON.parse(interaction.output_text));
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
}): Promise<CoachFollowUpResponse> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new CoachConfigurationError("GEMINI_API_KEY is missing");

  const client = new GoogleGenAI({ apiKey });
  const interaction = await client.interactions.create(
    {
      model: process.env.AI_MODEL || DEFAULT_MODEL,
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
        max_output_tokens: 1800,
      },
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: coachFollowUpResponseJsonSchema,
      },
    },
    { timeout: 45_000, maxRetries: 1 },
  );

  if (!interaction.output_text) throw new Error("Gemini returned an empty response");

  const result = coachFollowUpResponseSchema.parse(
    JSON.parse(interaction.output_text),
  );
  const allowedSourceIds = new Set(
    question.sources.map(({ sectionId }) => sectionId),
  );
  if (result.sourceSectionIds.some((id) => !allowedSourceIds.has(id))) {
    throw new Error("Gemini returned an unknown source section");
  }
  return result;
}

export class CoachConfigurationError extends Error {}
