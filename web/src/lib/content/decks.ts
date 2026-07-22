import type { ContentLanguage, PracticeDeckId } from "./schema";

export const PRACTICE_DECKS = {
  "cpp-interview": {
    id: "cpp-interview",
    language: "cpp",
    badge: "C++",
    label: "C++ Interview",
  },
  "python-interview": {
    id: "python-interview",
    language: "python",
    badge: "Py",
    label: "Python Interview",
  },
} as const satisfies Record<
  PracticeDeckId,
  {
    id: PracticeDeckId;
    language: ContentLanguage;
    badge: string;
    label: string;
  }
>;

export function parsePracticeDeck(value: string | undefined): PracticeDeckId {
  return value === "python-interview" ? value : "cpp-interview";
}

export function deckForLanguage(language: ContentLanguage): PracticeDeckId {
  return language === "python" ? "python-interview" : "cpp-interview";
}
