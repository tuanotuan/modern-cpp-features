import { describe, expect, it } from "vitest";

import {
  applyScenarioEditorKey,
  scenarioEditorConfig,
} from "./scenario-editor";

describe("scenario code editor", () => {
  it("uses language-specific filenames and templates", () => {
    expect(scenarioEditorConfig("cpp")).toMatchObject({
      fileName: "main.cpp",
      languageLabel: "C++",
    });
    expect(scenarioEditorConfig("python")).toMatchObject({
      fileName: "main.py",
      languageLabel: "Python",
    });
    expect(scenarioEditorConfig("cmake")).toMatchObject({
      fileName: "CMakeLists.txt",
      languageLabel: "CMake",
    });
    expect(scenarioEditorConfig("cmake").template).toContain("add_executable");
    expect(scenarioEditorConfig("cmake").placeholder).toContain("target graph");
  });

  it("closes brackets and keeps the caret inside", () => {
    expect(applyScenarioEditorKey("call", 4, 4, "(")).toEqual({
      value: "call()",
      selectionStart: 5,
      selectionEnd: 5,
    });
    expect(applyScenarioEditorKey("{}", 1, 1, "}")).toEqual({
      value: "{}",
      selectionStart: 2,
      selectionEnd: 2,
    });
  });

  it("wraps selected code with a pair", () => {
    expect(applyScenarioEditorKey("value", 0, 5, "(")).toEqual({
      value: "(value)",
      selectionStart: 1,
      selectionEnd: 6,
    });
  });

  it("creates an indented line inside an empty pair", () => {
    expect(applyScenarioEditorKey("if (ready) {}", 12, 12, "Enter")).toEqual({
      value: "if (ready) {\n  \n}",
      selectionStart: 15,
      selectionEnd: 15,
    });
  });

  it("indents Python blocks after a colon", () => {
    expect(applyScenarioEditorKey("if ready:", 9, 9, "Enter")).toEqual({
      value: "if ready:\n  ",
      selectionStart: 12,
      selectionEnd: 12,
    });
  });

  it("indents and unindents selected lines with Tab", () => {
    const indented = applyScenarioEditorKey("one\ntwo", 0, 7, "Tab");
    expect(indented).toEqual({
      value: "  one\n  two",
      selectionStart: 2,
      selectionEnd: 11,
    });
    expect(
      applyScenarioEditorKey(
        indented!.value,
        indented!.selectionStart,
        indented!.selectionEnd,
        "Tab",
        true,
      ),
    ).toEqual({
      value: "one\ntwo",
      selectionStart: 0,
      selectionEnd: 7,
    });
  });

  it("removes both characters when backspacing an empty pair", () => {
    expect(applyScenarioEditorKey("{}", 1, 1, "Backspace")).toEqual({
      value: "",
      selectionStart: 0,
      selectionEnd: 0,
    });
  });
});
