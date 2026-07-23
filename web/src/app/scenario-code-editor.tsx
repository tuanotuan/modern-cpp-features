"use client";

import Editor, {
  loader,
  type BeforeMount,
  type OnMount,
} from "@monaco-editor/react";
import { useMemo } from "react";
import type { editor } from "monaco-editor";

import type { ContentLanguage } from "@/lib/content/schema";

loader.config({
  paths: {
    vs: "https://cdn.jsdelivr.net/npm/monaco-editor@0.56.0/min/vs",
  },
});

const languageIds: Record<ContentLanguage, string> = {
  cpp: "cpp",
  python: "python",
  cmake: "cmake",
};

const handleBeforeMount: BeforeMount = (monaco) => {
  monaco.editor.defineTheme("recall-dark", {
    base: "vs-dark",
    inherit: true,
    rules: [
      { token: "comment", foreground: "6F9185", fontStyle: "italic" },
      { token: "keyword", foreground: "D7FF91" },
      { token: "string", foreground: "F2C879" },
      { token: "number", foreground: "E99B77" },
      { token: "variable", foreground: "8ED8C0" },
    ],
    colors: {
      "editor.background": "#0B241D",
      "editor.foreground": "#E8F4EC",
      "editorLineNumber.foreground": "#526B62",
      "editorLineNumber.activeForeground": "#D7FF91",
      "editorCursor.foreground": "#D7FF91",
      "editor.selectionBackground": "#356B5875",
      "editor.inactiveSelectionBackground": "#356B5845",
      "editorIndentGuide.background1": "#FFFFFF12",
      "editorIndentGuide.activeBackground1": "#D7FF9145",
      "editorBracketHighlight.foreground1": "#D7FF91",
      "editorBracketHighlight.foreground2": "#8ED8C0",
      "editorBracketHighlight.foreground3": "#F2C879",
      "editorWidget.background": "#102F27",
      "editorWidget.border": "#356B58",
      "input.background": "#0B241D",
      "focusBorder": "#D7FF91",
    },
  });

  if (
    !monaco.languages
      .getLanguages()
      .some((language: { id: string }) => language.id === "cmake")
  ) {
    monaco.languages.register({
      id: "cmake",
      extensions: [".cmake"],
      filenames: ["CMakeLists.txt"],
    });
    monaco.languages.setMonarchTokensProvider("cmake", {
      defaultToken: "",
      tokenPostfix: ".cmake",
      keywords: [
        "add_executable",
        "add_library",
        "cmake_minimum_required",
        "find_package",
        "include",
        "install",
        "project",
        "set",
        "target_compile_definitions",
        "target_compile_features",
        "target_include_directories",
        "target_link_libraries",
        "target_sources",
      ],
      tokenizer: {
        root: [
          [/#.*$/, "comment"],
          [/\$\{[^}]+\}/, "variable"],
          [/"(?:[^"\\]|\\.)*"/, "string"],
          [/\b\d+(?:\.\d+)*\b/, "number"],
          [
            /[a-zA-Z_]\w*/,
            {
              cases: {
                "@keywords": "keyword",
                "@default": "identifier",
              },
            },
          ],
          [/[()]/, "@brackets"],
        ],
      },
    });
  }
};

const handleMount: OnMount = (editor, monaco) => {
  editor.addCommand(monaco.KeyMod.CtrlCmd | monaco.KeyCode.KeyS, () => undefined);
  editor.focus();
};

export function MonacoCodeEditor({
  language,
  value,
  onChange,
  height,
  expanded,
  placeholder,
}: {
  language: ContentLanguage;
  value: string;
  onChange: (value: string) => void;
  height: string;
  expanded: boolean;
  placeholder: string;
}) {
  const options = useMemo<editor.IStandaloneEditorConstructionOptions>(
    () => ({
      ariaLabel: `Code ${languageIds[language]} cho câu hỏi thiết kế`,
      automaticLayout: true,
      autoClosingBrackets: "always",
      autoClosingDelete: "always",
      autoClosingOvertype: "always",
      autoClosingQuotes: "always",
      autoIndent: "full",
      bracketPairColorization: { enabled: true },
      cursorBlinking: "smooth",
      cursorSmoothCaretAnimation: "on",
      detectIndentation: false,
      folding: true,
      fontFamily: '"Cascadia Code", "SFMono-Regular", Consolas, monospace',
      fontLigatures: true,
      fontSize: 13,
      formatOnPaste: true,
      formatOnType: true,
      guides: {
        bracketPairs: true,
        indentation: true,
      },
      insertSpaces: true,
      lineHeight: 24,
      matchBrackets: "always",
      minimap: { enabled: expanded },
      padding: { top: 16, bottom: 16 },
      placeholder,
      quickSuggestions: true,
      renderWhitespace: "selection",
      scrollBeyondLastLine: false,
      smoothScrolling: true,
      tabSize: 2,
      wordWrap: "on",
    }),
    [expanded, language, placeholder],
  );

  return (
    <Editor
      height={height}
      language={languageIds[language]}
      path={`candidate-answer.${languageIds[language]}`}
      value={value}
      theme="recall-dark"
      beforeMount={handleBeforeMount}
      onMount={handleMount}
      onChange={(nextValue) => onChange(nextValue ?? "")}
      loading={
        <div className="grid h-full place-items-center bg-[#0b241d] font-mono text-xs text-white/45">
          Đang tải VS Code editor…
        </div>
      }
      saveViewState={false}
      options={options}
    />
  );
}
