import { describe, expect, it } from "vitest";

import {
  deckForLanguage,
  ENABLED_PRACTICE_DECK_IDS,
  parsePracticeDeck,
  PRACTICE_DECKS,
} from "./decks";

describe("practice decks", () => {
  it("maps content languages to stable deck IDs", () => {
    expect(deckForLanguage("cpp")).toBe("cpp-interview");
    expect(deckForLanguage("python")).toBe("python-interview");
    expect(deckForLanguage("cmake")).toBe("cmake-build-systems");
  });

  it("defaults invalid or missing URL values to the existing C++ deck", () => {
    expect(parsePracticeDeck(undefined)).toBe("cpp-interview");
    expect(parsePracticeDeck("unknown")).toBe("cpp-interview");
    expect(parsePracticeDeck("python-interview")).toBe("python-interview");
    expect(PRACTICE_DECKS["python-interview"].badge).toBe("Py");
    expect(PRACTICE_DECKS["cmake-build-systems"].enabled).toBe(false);
    expect(ENABLED_PRACTICE_DECK_IDS).not.toContain("cmake-build-systems");
  });
});
