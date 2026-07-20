import { describe, expect, it } from "vitest";

import {
  parseSavedItems,
  removeSavedItem,
  upsertSavedItem,
  type SavedItem,
} from "./saved-items";

const item: SavedItem = {
  id: "question:cpp11-example-001",
  kind: "question",
  questionId: "cpp11-example-001",
  title: "A useful C++ question",
  content: "Explain the rule and its consequences.",
  savedAt: "2026-07-20T08:00:00.000Z",
};

describe("saved learning items", () => {
  it("round-trips valid saved items and rejects malformed storage", () => {
    expect(parseSavedItems(JSON.stringify([item]))).toEqual([item]);
    expect(parseSavedItems("not-json")).toEqual([]);
    expect(parseSavedItems('[{"kind":"unknown"}]')).toEqual([]);
  });

  it("upserts by stable ID and removes an item", () => {
    const updated = upsertSavedItem([item], {
      ...item,
      content: "Updated content",
      savedAt: "2026-07-20T09:00:00.000Z",
    });

    expect(updated).toHaveLength(1);
    expect(updated[0].content).toBe("Updated content");
    expect(removeSavedItem(updated, item.id)).toEqual([]);
  });
});
