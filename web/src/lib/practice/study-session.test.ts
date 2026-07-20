import { describe, expect, it } from "vitest";

import { parseStudySession, serializeStudySession } from "./study-session";

const identity = {
  id: "cpp20-designated-initializers-001",
  version: 2,
  sourceHash: "source-v2",
};

describe("study session persistence", () => {
  it("restores a valid session for the exact question source", () => {
    const raw = serializeStudySession(
      {
        [identity.id]: {
          questionVersion: identity.version,
          sourceHash: identity.sourceHash,
          answer: "Aggregate initialization follows declaration order.",
          revealed: true,
          sourceVisible: true,
          followUpChat: [
            { role: "user", content: "Why does declaration order matter?" },
          ],
          deepDiveOpen: true,
          deepDiveAnswer: "auto drops the top-level const during deduction.",
        },
      },
      identity.id,
    );

    const restored = parseStudySession(raw, [identity]);
    expect(restored.activeQuestionId).toBe(identity.id);
    expect(restored.questions[identity.id]).toMatchObject({
      answer: "Aggregate initialization follows declaration order.",
      revealed: true,
      sourceVisible: true,
      deepDiveOpen: true,
      deepDiveAnswer: "auto drops the top-level const during deduction.",
    });
  });

  it("drops stale sessions after a question source change", () => {
    const raw = serializeStudySession({
      [identity.id]: {
        questionVersion: identity.version,
        sourceHash: "old-source",
        answer: "Stale answer",
      },
    });

    expect(parseStudySession(raw, [identity]).questions).toEqual({});
  });

  it("recovers safely from malformed browser storage", () => {
    expect(parseStudySession("not-json", [identity]).questions).toEqual({});
    expect(parseStudySession('{"version":99}', [identity]).questions).toEqual({});
  });

  it("drops an active question that no longer exists", () => {
    const raw = serializeStudySession({}, "removed-question");
    expect(parseStudySession(raw, [identity]).activeQuestionId).toBeUndefined();
  });
});
