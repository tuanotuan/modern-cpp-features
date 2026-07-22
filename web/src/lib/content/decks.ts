import type { ContentLanguage, PracticeDeckId } from "./schema";

export const PRACTICE_DECKS = {
  "cpp-interview": {
    id: "cpp-interview",
    language: "cpp",
    badge: "C++",
    label: "C++ Interview",
    enabled: true,
  },
  "python-interview": {
    id: "python-interview",
    language: "python",
    badge: "Py",
    label: "Python Interview",
    enabled: true,
  },
  "cmake-build-systems": {
    id: "cmake-build-systems",
    language: "cmake",
    badge: "CM",
    label: "CMake / Build Systems",
    enabled: false,
  },
} as const satisfies Record<
  PracticeDeckId,
  {
    id: PracticeDeckId;
    language: ContentLanguage;
    badge: string;
    label: string;
    enabled: boolean;
  }
>;

export const ENABLED_PRACTICE_DECK_IDS = (
  Object.keys(PRACTICE_DECKS) as PracticeDeckId[]
).filter((deckId) => PRACTICE_DECKS[deckId].enabled);

export function parsePracticeDeck(value: string | undefined): PracticeDeckId {
  return value === "python-interview" ? value : "cpp-interview";
}

export function deckForLanguage(language: ContentLanguage): PracticeDeckId {
  if (language === "python") return "python-interview";
  if (language === "cmake") return "cmake-build-systems";
  return "cpp-interview";
}
