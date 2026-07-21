import { describe, expect, it } from "vitest";

import { displayQuestionPrompt } from "./question-prompt";

describe("displayQuestionPrompt", () => {
  it("keeps ordinary prompts and inline C++ terms intact", () => {
    expect(
      displayQuestionPrompt({
        prompt: "Vì sao `override` hữu ích?",
        code: "void run() override;",
      }),
    ).toBe("Vì sao `override` hữu ích?");
  });

  it("removes a duplicated fenced snippet when code has its own field", () => {
    expect(
      displayQuestionPrompt({
        prompt: "Đoạn mã có vấn đề gì?\n\n```cpp\nclass Cat {};\n```",
        code: "class Cat {};",
      }),
    ).toBe("Đoạn mã có vấn đề gì?");
  });

  it("keeps prose that follows the duplicated snippet", () => {
    expect(
      displayQuestionPrompt({
        prompt:
          "Lớp con đang viết sai:\n```cpp\nvoid taak();\n```\nHãy sửa khai báo.",
        code: "void taak();",
      }),
    ).toBe("Lớp con đang viết sai. Hãy sửa khai báo.");
  });
});

