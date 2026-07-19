import { describe, expect, it } from "vitest";

import { nextQuestionIds } from "./drafts";

describe("question draft IDs", () => {
  it("continues a lesson's numeric sequence without collisions", () => {
    expect(
      nextQuestionIds(
        "cpp11-auto",
        ["cpp11-auto-001", "cpp11-auto-003", "cpp11-nullptr-004"],
        2,
      ),
    ).toEqual(["cpp11-auto-004", "cpp11-auto-005"]);
  });
});
