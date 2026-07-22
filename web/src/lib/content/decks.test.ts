import { describe, expect, it } from "vitest";

import {
  deckForLanguage,
  parsePracticeDeck,
  PRACTICE_DECKS,
} from "./decks";

describe("practice decks", () => {
  it("maps content languages to stable deck IDs", () => {
    expect(deckForLanguage("cpp")).toBe("cpp-interview");
    expect(deckForLanguage("python")).toBe("python-interview");
  });

  it("defaults invalid or missing URL values to the existing C++ deck", () => {
    expect(parsePracticeDeck(undefined)).toBe("cpp-interview");
    expect(parsePracticeDeck("unknown")).toBe("cpp-interview");
    expect(parsePracticeDeck("python-interview")).toBe("python-interview");
    expect(PRACTICE_DECKS["python-interview"].badge).toBe("Py");
  });
});
