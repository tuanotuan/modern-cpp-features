import type { ContentLanguage } from "../content/schema";

const INDENT = "  ";
const OPENING_PAIRS: Record<string, string> = {
  "(": ")",
  "[": "]",
  "{": "}",
  '"': '"',
  "'": "'",
};
const CLOSING_PAIRS = new Set(Object.values(OPENING_PAIRS));

export type ScenarioEditorEdit = {
  value: string;
  selectionStart: number;
  selectionEnd: number;
};

function replaceSelection(
  value: string,
  start: number,
  end: number,
  replacement: string,
  selectionStart: number,
  selectionEnd = selectionStart,
): ScenarioEditorEdit {
  return {
    value: `${value.slice(0, start)}${replacement}${value.slice(end)}`,
    selectionStart,
    selectionEnd,
  };
}

function transformIndent(block: string, unindent: boolean) {
  return unindent
    ? block.replace(/^(?: {1,2}|\t)/gm, "")
    : block.replace(/^/gm, INDENT);
}

export function applyScenarioEditorKey(
  value: string,
  start: number,
  end: number,
  key: string,
  shiftKey = false,
): ScenarioEditorEdit | null {
  if (key === "Tab") {
    if (start !== end || shiftKey) {
      const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
      const block = value.slice(lineStart, end);
      const prefix = value.slice(lineStart, start);
      const nextBlock = transformIndent(block, shiftKey);
      const nextPrefix = transformIndent(prefix, shiftKey);
      return replaceSelection(
        value,
        lineStart,
        end,
        nextBlock,
        lineStart + nextPrefix.length,
        lineStart + nextBlock.length,
      );
    }
    return replaceSelection(value, start, end, INDENT, start + INDENT.length);
  }

  if (key === "Backspace" && start === end && start > 0) {
    const previous = value[start - 1];
    const next = value[start];
    if (OPENING_PAIRS[previous] === next) {
      return replaceSelection(value, start - 1, start + 1, "", start - 1);
    }
    return null;
  }

  if (key === "Enter") {
    const lineStart = value.lastIndexOf("\n", Math.max(0, start - 1)) + 1;
    const currentIndent = value.slice(lineStart, start).match(/^[ \t]*/)?.[0] ?? "";
    const previous = value[start - 1];
    const next = value[end];
    const isEmptyPair = start === end && OPENING_PAIRS[previous] === next;

    if (isEmptyPair) {
      const insertion = `\n${currentIndent}${INDENT}\n${currentIndent}`;
      return replaceSelection(
        value,
        start,
        end,
        insertion,
        start + 1 + currentIndent.length + INDENT.length,
      );
    }

    const shouldIndent = previous === "{" || previous === "[" || previous === "(" || previous === ":";
    const insertion = `\n${currentIndent}${shouldIndent ? INDENT : ""}`;
    return replaceSelection(value, start, end, insertion, start + insertion.length);
  }

  const closing = OPENING_PAIRS[key];
  if (closing) {
    if (
      start === end &&
      (key === '"' || key === "'") &&
      value[start] === key
    ) {
      return { value, selectionStart: start + 1, selectionEnd: start + 1 };
    }
    if ((key === '"' || key === "'") && value[start - 1] === "\\") {
      return null;
    }
    const selected = value.slice(start, end);
    return replaceSelection(
      value,
      start,
      end,
      `${key}${selected}${closing}`,
      start + 1,
      selected ? start + 1 + selected.length : start + 1,
    );
  }

  if (start === end && CLOSING_PAIRS.has(key) && value[start] === key) {
    return { value, selectionStart: start + 1, selectionEnd: start + 1 };
  }

  return null;
}

const CPLUSPLUS_DESIGN_TEMPLATE = `#include <utility>

class Solution {
public:
    // Thiết kế public API ở đây.

private:
    // Khai báo state và ownership ở đây.
};`;

const PYTHON_DESIGN_TEMPLATE = `class Solution:
    """Thiết kế public API và state ở đây."""

    def __init__(self) -> None:
        pass`;

const CMAKE_DESIGN_TEMPLATE = `cmake_minimum_required(VERSION 3.25)
project(TradingSystem LANGUAGES CXX)

# Khai báo targets và usage requirements ở đây.
add_executable(trading_app main.cpp)`;

export function scenarioEditorConfig(language: ContentLanguage) {
  if (language === "python") {
    return {
      fileName: "main.py",
      languageLabel: "Python",
      template: PYTHON_DESIGN_TEMPLATE,
      placeholder: "# Thiết kế class/API của mày ở đây…\n\nclass Solution:\n    pass",
    };
  }
  if (language === "cmake") {
    return {
      fileName: "CMakeLists.txt",
      languageLabel: "CMake",
      template: CMAKE_DESIGN_TEMPLATE,
      placeholder: "# Viết target graph và usage requirements ở đây…\n\nadd_library(core ...)",
    };
  }
  return {
    fileName: "main.cpp",
    languageLabel: "C++",
    template: CPLUSPLUS_DESIGN_TEMPLATE,
    placeholder: "// Thiết kế class/API của mày ở đây…\n\nclass Solution {\npublic:\n    // ...\n};",
  };
}
