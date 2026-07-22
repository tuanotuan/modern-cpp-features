import { GoogleGenAI } from "@google/genai";
import { zodTextFormat } from "openai/helpers/zod";
import { z } from "zod";

import {
  geminiFallbackModel,
  isGeminiFallbackConfigured,
} from "../ai/gemini";
import {
  openAIClient,
  openAIModel,
  safetyIdentifier,
} from "../ai/openai";
import type { GeneratedLesson } from "./schema";

const MAX_PROVIDER_ATTEMPTS = 3;

export const aiQuestionDraftSchema = z.object({
  type: z.enum(["recall", "code_reasoning", "pitfall", "scenario"]),
  responseMode: z.enum(["text", "code"]),
  difficulty: z.enum(["beginner", "intermediate", "advanced"]),
  estimatedMinutes: z.number().int().min(1).max(15),
  prompt: z.string().trim().min(10),
  code: z.string().trim().min(1).nullable(),
  hint: z.string().trim().min(5),
  answer: z.object({
    short: z.string().trim().min(10),
    detailed: z.string().trim().min(20),
  }),
  rubric: z.object({
    required: z.array(z.string().trim().min(3)).min(1),
    bonus: z.array(z.string().trim().min(3)),
    misconceptions: z.array(z.string().trim().min(3)),
  }),
  sources: z.array(z.object({ sectionId: z.string().min(1) })).min(1),
});

export const aiDraftResponseSchema = z.object({
  questions: z.array(aiQuestionDraftSchema).min(1).max(5),
});

export type AiQuestionDraft = z.infer<typeof aiQuestionDraftSchema>;
export type GeneratedQuestionDraftBatch = {
  questions: AiQuestionDraft[];
  provider: "openai" | "gemini";
  model: string;
};

export const QUESTION_GENERATOR_PROMPT_VERSION = "trading-grounded-v1";

export async function generateQuestionDraftsWithOpenAI({
  lesson,
  count,
}: {
  lesson: GeneratedLesson;
  count: number;
}): Promise<AiQuestionDraft[]> {
  return (await generateQuestionDraftBatchWithOpenAI({ lesson, count })).questions;
}

export async function generateQuestionDraftBatchWithFallback({
  lesson,
  count,
}: {
  lesson: GeneratedLesson;
  count: number;
}): Promise<GeneratedQuestionDraftBatch> {
  try {
    return await generateQuestionDraftBatchWithOpenAI({ lesson, count });
  } catch (error) {
    if (!isProviderRateLimitError(error) || !isGeminiFallbackConfigured()) {
      throw error;
    }
    return generateQuestionDraftBatchWithGemini({ lesson, count });
  }
}

export async function generateQuestionDraftBatchWithOpenAI({
  lesson,
  count,
}: {
  lesson: GeneratedLesson;
  count: number;
}): Promise<GeneratedQuestionDraftBatch> {
  if (!Number.isInteger(count) || count < 1 || count > 5) {
    throw new Error("Draft count must be an integer from 1 to 5");
  }

  const client = openAIClient();
  const model = openAIModel("luna");
  const interaction = await retryProviderRateLimit(() =>
    client.responses.parse({
      model,
      store: false,
      safety_identifier: safetyIdentifier("content-automation"),
      instructions:
        "You create grounded C++ interview questions for software-engineering interviews at trading, quantitative-finance, and low-latency companies. Return Vietnamese questions and answers. Never introduce facts not supported by the supplied private study note.",
      input: buildDraftPrompt(lesson, count),
      reasoning: { effort: "low" },
      max_output_tokens: 6000,
      text: {
        format: zodTextFormat(aiDraftResponseSchema, "question_drafts"),
        verbosity: "medium",
      },
    }),
  );

  if (!interaction.output_parsed) {
    throw new Error("OpenAI returned an empty draft response");
  }
  const result = interaction.output_parsed;
  if (result.questions.length !== count) {
    throw new Error(
      `OpenAI returned ${result.questions.length} drafts; expected ${count}`,
    );
  }

  validateDraftSources(lesson, result.questions, "OpenAI");

  return { questions: result.questions, provider: "openai", model };
}

export async function generateQuestionDraftBatchWithGemini({
  lesson,
  count,
}: {
  lesson: GeneratedLesson;
  count: number;
}): Promise<GeneratedQuestionDraftBatch> {
  if (!Number.isInteger(count) || count < 1 || count > 5) {
    throw new Error("Draft count must be an integer from 1 to 5");
  }
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
  const model = geminiFallbackModel();
  const interaction = await new GoogleGenAI({ apiKey }).interactions.create(
    {
      model,
      store: false,
      system_instruction:
        "You create grounded C++ interview questions for software-engineering interviews at trading, quantitative-finance, and low-latency companies. Return Vietnamese questions and answers. Never introduce facts not supported by the supplied private study note.",
      input: buildDraftPrompt(lesson, count),
      generation_config: {
        thinking_level: "low",
        temperature: 0.2,
        max_output_tokens: 6000,
      },
      response_format: {
        type: "text",
        mime_type: "application/json",
        schema: z.toJSONSchema(aiDraftResponseSchema),
      },
    },
    { timeout: 45_000, maxRetries: 1 },
  );
  if (!interaction.output_text) {
    throw new Error("Gemini returned an empty draft response");
  }
  const result = aiDraftResponseSchema.parse(JSON.parse(interaction.output_text));
  if (result.questions.length !== count) {
    throw new Error(
      `Gemini returned ${result.questions.length} drafts; expected ${count}`,
    );
  }
  validateDraftSources(lesson, result.questions, "Gemini");
  return { questions: result.questions, provider: "gemini", model };
}

export function validateDraftSources(
  lesson: GeneratedLesson,
  questions: AiQuestionDraft[],
  provider: string,
) {
  const sectionIds = new Set(lesson.sections.map((section) => section.id));
  for (const question of questions) {
    for (const source of question.sources) {
      if (!sectionIds.has(source.sectionId)) {
        throw new Error(
          `${provider} cited unknown section ${source.sectionId} in ${lesson.id}`,
        );
      }
    }
  }
}

export async function retryProviderRateLimit<T>(
  operation: () => Promise<T>,
  {
    maxAttempts = MAX_PROVIDER_ATTEMPTS,
    sleep = (milliseconds: number) =>
      new Promise<void>((resolve) => setTimeout(resolve, milliseconds)),
  }: {
    maxAttempts?: number;
    sleep?: (milliseconds: number) => Promise<void>;
  } = {},
): Promise<T> {
  for (let attempt = 1; ; attempt += 1) {
    try {
      return await operation();
    } catch (error) {
      if (!isProviderRateLimitError(error) || attempt >= maxAttempts) throw error;
      const delayMs = providerRetryDelayMs(error);
      console.warn(
        `OpenAI rate-limited draft generation; retrying attempt ${attempt + 1}/${maxAttempts} in ${Math.ceil(delayMs / 1000)}s.`,
      );
      await sleep(delayMs);
    }
  }
}

export function isProviderRateLimitError(error: unknown) {
  if (typeof error !== "object" || error === null) return false;
  const status =
    "statusCode" in error
      ? error.statusCode
      : "status" in error
        ? error.status
        : undefined;
  return status === 429;
}

function providerRetryDelayMs(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  const seconds = Number(/retry in ([\d.]+)s/i.exec(message)?.[1] ?? 60);
  return Math.min(75_000, Math.max(1_000, Math.ceil(seconds * 1000) + 1_000));
}

export function nextQuestionIds(
  lessonId: string,
  existingIds: string[],
  count: number,
) {
  const escaped = lessonId.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const pattern = new RegExp(`^${escaped}-(\\d+)$`);
  const highest = Math.max(
    0,
    ...existingIds.map((id) => Number(pattern.exec(id)?.[1] ?? 0)),
  );

  return Array.from(
    { length: count },
    (_, index) => `${lessonId}-${String(highest + index + 1).padStart(3, "0")}`,
  );
}

export function buildDraftPrompt(lesson: GeneratedLesson, count: number) {
  const sections = lesson.sections.map((section) => ({
    sectionId: section.id,
    heading: section.heading,
    content: section.bodyMarkdown.slice(0, 3000),
  }));

  return JSON.stringify(
    {
      task: `Create exactly ${count} distinct interview-question drafts. Cite only sectionId values supplied below.`,
      rules: [
        "Use Vietnamese for prompt, hint, answers, and rubric.",
        "Test understanding and reasoning, not trivia.",
        "Target C++ software-engineering interviews at trading, quantitative-finance, and low-latency companies.",
        count >= 2
          ? "Include at least one question whose type is scenario and whose situation is realistic for a production trading system."
          : "Prefer type scenario when the lesson can support a realistic production trading situation without forcing the context.",
        "A trading scenario must involve a concrete engineering constraint or failure mode, such as market-data throughput, order-book updates, order routing, pre-trade risk checks, position state, exchange connectivity, latency, allocation, cache locality, concurrency, contention, backpressure, deterministic behavior, ownership, or recovery.",
        "Do not merely rename a toy variable to Order or Price. The trading context must materially affect the design choice, correctness argument, performance trade-off, or failure analysis being tested.",
        "Keep scenarios plausible and answerable in an interview. State enough context and constraints for the candidate; do not assume undocumented infrastructure.",
        "Do not require finance-domain knowledge that is absent from the lesson. Never invent exchange rules, latency numbers, market behavior, or risk formulas; the assessed C++ facts must remain grounded in the supplied sections.",
        "Keep the canonical short answer concise and make the detailed answer interview-ready.",
        "Use code only when it materially improves the question; otherwise return null.",
        "Never put fenced code or a code snippet inside prompt. When a snippet is needed, store it only in the separate code field and let prompt refer to it as the code below.",
        "Set responseMode to code only when the candidate is explicitly required to write or modify C++ code. Explanatory, analytical, and scenario questions must use text.",
        "When responseMode is code, make the prompt explicitly ask the candidate to write or modify code.",
      ],
      lesson: {
        id: lesson.id,
        title: lesson.title,
        standard: lesson.standard,
        sections,
        code: lesson.code?.slice(0, 6000) ?? null,
      },
    },
    null,
    2,
  );
}
