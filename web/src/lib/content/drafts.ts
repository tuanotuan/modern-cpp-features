import { GoogleGenAI } from "@google/genai";
import { z } from "zod";

import type { GeneratedLesson } from "./schema";

const DEFAULT_MODEL = "gemini-3-flash-preview";
const MAX_PROVIDER_ATTEMPTS = 3;

const aiQuestionDraftSchema = z.object({
  type: z.enum(["recall", "code_reasoning", "pitfall", "scenario"]),
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

const aiDraftResponseSchema = z.object({
  questions: z.array(aiQuestionDraftSchema).min(1).max(5),
});

export type AiQuestionDraft = z.infer<typeof aiQuestionDraftSchema>;

const aiDraftResponseJsonSchema = {
  type: "object",
  additionalProperties: false,
  required: ["questions"],
  properties: {
    questions: {
      type: "array",
      minItems: 1,
      maxItems: 5,
      items: {
        type: "object",
        additionalProperties: false,
        required: [
          "type",
          "difficulty",
          "estimatedMinutes",
          "prompt",
          "code",
          "hint",
          "answer",
          "rubric",
          "sources",
        ],
        properties: {
          type: {
            type: "string",
            enum: ["recall", "code_reasoning", "pitfall", "scenario"],
          },
          difficulty: {
            type: "string",
            enum: ["beginner", "intermediate", "advanced"],
          },
          estimatedMinutes: { type: "integer", minimum: 1, maximum: 15 },
          prompt: { type: "string" },
          code: { type: ["string", "null"] },
          hint: { type: "string" },
          answer: {
            type: "object",
            additionalProperties: false,
            required: ["short", "detailed"],
            properties: {
              short: { type: "string" },
              detailed: { type: "string" },
            },
          },
          rubric: {
            type: "object",
            additionalProperties: false,
            required: ["required", "bonus", "misconceptions"],
            properties: {
              required: { type: "array", items: { type: "string" } },
              bonus: { type: "array", items: { type: "string" } },
              misconceptions: { type: "array", items: { type: "string" } },
            },
          },
          sources: {
            type: "array",
            items: {
              type: "object",
              additionalProperties: false,
              required: ["sectionId"],
              properties: { sectionId: { type: "string" } },
            },
          },
        },
      },
    },
  },
};

export async function generateQuestionDraftsWithGemini({
  lesson,
  count,
}: {
  lesson: GeneratedLesson;
  count: number;
}): Promise<AiQuestionDraft[]> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is missing");
  if (!Number.isInteger(count) || count < 1 || count > 5) {
    throw new Error("Draft count must be an integer from 1 to 5");
  }

  const client = new GoogleGenAI({ apiKey });
  const interaction = await retryProviderRateLimit(() =>
    client.interactions.create(
      {
        model: process.env.AI_MODEL || DEFAULT_MODEL,
        store: false,
        system_instruction:
          "You create grounded C++ interview questions from the supplied private study note. Return Vietnamese questions and answers. Never introduce facts not supported by the note.",
        input: buildDraftPrompt(lesson, count),
        generation_config: {
          thinking_level: "high",
          temperature: 0.35,
          max_output_tokens: 6000,
        },
        response_format: {
          type: "text",
          mime_type: "application/json",
          schema: aiDraftResponseJsonSchema,
        },
      },
      { timeout: 60_000, maxRetries: 1 },
    ),
  );

  if (!interaction.output_text) throw new Error("Gemini returned an empty response");
  const result = aiDraftResponseSchema.parse(JSON.parse(interaction.output_text));
  if (result.questions.length !== count) {
    throw new Error(
      `Gemini returned ${result.questions.length} drafts; expected ${count}`,
    );
  }

  const sectionIds = new Set(lesson.sections.map((section) => section.id));
  for (const question of result.questions) {
    for (const source of question.sources) {
      if (!sectionIds.has(source.sectionId)) {
        throw new Error(
          `Gemini cited unknown section ${source.sectionId} in ${lesson.id}`,
        );
      }
    }
  }

  return result.questions;
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
        `Gemini rate-limited draft generation; retrying attempt ${attempt + 1}/${maxAttempts} in ${Math.ceil(delayMs / 1000)}s.`,
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
        "Keep the canonical short answer concise and make the detailed answer interview-ready.",
        "Use code only when it materially improves the question; otherwise return null.",
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
