import { describe, expect, it } from "vitest";

import { scenarioEditorConfig } from "./scenario-editor";

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

});
