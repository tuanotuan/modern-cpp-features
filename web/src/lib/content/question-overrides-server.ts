import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

import {
  questionOverrideSelect,
  rowsToQuestionOverrides,
  type QuestionOverride,
  type QuestionOverrideRow,
} from "./question-overrides";

export async function loadQuestionOverrides(
  client: SupabaseClient,
): Promise<{ overrides: QuestionOverride[]; error: boolean }> {
  const { data, error } = await client
    .from("question_overrides")
    .select(questionOverrideSelect);
  return {
    overrides: error
      ? []
      : rowsToQuestionOverrides((data ?? []) as QuestionOverrideRow[]),
    error: Boolean(error),
  };
}
