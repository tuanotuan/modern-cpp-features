import { describe, expect, it } from "vitest";

import {
  createMockInterviewSession,
  parseMockInterviewSession,
  serializeMockInterviewSession,
  type MockInterviewSession,
} from "./session";

const baseSession = createMockInterviewSession({
  sessionId: "9f58ceae-6ce7-4d56-bf6e-2be2256cc063",
  setId: "worldquant-45-a",
  sourceRevision: "a".repeat(40),
  startedAt: new Date("2026-07-24T01:00:00.000Z"),
});

const session: MockInterviewSession = {
  ...baseSession,
  currentIndex: 1,
  answers: {
    "worldquant-tick-feed-correctness": {
      response: "A reference does not extend every lifetime automatically.",
      explanation: "Giữ ordering invariant trước khi tối ưu.",
    },
  },
  elapsedByQuestion: { "worldquant-tick-feed-correctness": 92 },
  activeQuestionStartedAt: "2026-07-24T01:03:00.000Z",
};

describe("mock interview session persistence", () => {
  it("round-trips an in-progress versioned session", () => {
    expect(
      parseMockInterviewSession(serializeMockInterviewSession(session)),
    ).toEqual(session);
  });

  it("replays the same set with fresh timing and no previous answers", () => {
    const replay = createMockInterviewSession({
      sessionId: "f5f064e9-d6c9-4688-a3a8-82176c8a02b1",
      setId: session.setId,
      sourceRevision: session.sourceRevision,
      startedAt: new Date("2026-07-25T02:00:00.000Z"),
    });

    expect(replay.questions).toEqual(baseSession.questions);
    expect(replay.sessionId).not.toBe(session.sessionId);
    expect(replay.startedAt).not.toBe(session.startedAt);
    expect(replay.answers).toEqual({});
    expect(replay.elapsedByQuestion).toEqual({});
    expect(replay.report).toBeUndefined();
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

  it("rejects a session whose duration, version or order does not match its set", () => {
    expect(
      parseMockInterviewSession(
        JSON.stringify({ ...session, durationMinutes: 30 }),
      ),
    ).toBeNull();
    expect(
      parseMockInterviewSession(
        JSON.stringify({ ...session, setVersion: 99 }),
      ),
    ).toBeNull();
    expect(
      parseMockInterviewSession(
        JSON.stringify({
          ...session,
          questions: [...session.questions].reverse(),
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
