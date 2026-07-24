import { describe, expect, it } from "vitest";

import {
  parseMockInterviewSession,
  serializeMockInterviewSession,
  type MockInterviewSession,
} from "./session";

const session: MockInterviewSession = {
  schemaVersion: 1,
  sessionId: "9f58ceae-6ce7-4d56-bf6e-2be2256cc063",
  profileId: "worldquant-tick-data-engineer",
  profileVersion: 1,
  sourceRevision: "a".repeat(40),
  durationMinutes: 45,
  status: "in_progress",
  startedAt: "2026-07-24T01:00:00.000Z",
  deadlineAt: "2026-07-24T01:45:00.000Z",
  questions: [
    {
      id: "cpp11-reference-001",
      origin: "question_bank",
      version: 2,
      contentRevision: "b".repeat(64),
    },
    {
      id: "worldquant-tick-feed-correctness",
      origin: "role_profile",
      version: 1,
      contentRevision: "worldquant-jd-2025-v1",
    },
    {
      id: "worldquant-legacy-migration",
      origin: "role_profile",
      version: 1,
      contentRevision: "worldquant-jd-2025-v1",
    },
  ],
  currentIndex: 1,
  answers: {
    "cpp11-reference-001": {
      response: "A reference does not extend every lifetime automatically.",
      explanation: "",
    },
  },
  elapsedByQuestion: { "cpp11-reference-001": 92 },
  activeQuestionStartedAt: "2026-07-24T01:03:00.000Z",
};

describe("mock interview session persistence", () => {
  it("round-trips an in-progress versioned session", () => {
    expect(
      parseMockInterviewSession(serializeMockInterviewSession(session)),
    ).toEqual(session);
  });

  it("rejects malformed and duplicate-question sessions", () => {
    expect(parseMockInterviewSession("not-json")).toBeNull();
    expect(
      parseMockInterviewSession(
        JSON.stringify({
          ...session,
          questions: [session.questions[0], session.questions[0]],
        }),
      ),
    ).toBeNull();
  });

  it("does not accept a completed session without its final report", () => {
    expect(
      parseMockInterviewSession(
        JSON.stringify({ ...session, status: "completed" }),
      ),
    ).toBeNull();
  });
});
