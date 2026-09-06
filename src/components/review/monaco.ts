import type { Monaco } from "@monaco-editor/react";

export const THEME = "idecoder";

export function defineTheme(monaco: Monaco) {
  monaco.editor.defineTheme(THEME, {
    base: "vs-dark",
    inherit: true,
    rules: [],
    colors: {
      "editor.background": "#0e1116",
      "editor.lineHighlightBackground": "#161b22",
      "editorGutter.background": "#0e1116",
      "diffEditor.insertedTextBackground": "#3ee0b21f",
      "diffEditor.removedTextBackground": "#f051631f",
    },
  });
}

export const EDITOR_OPTIONS = {
  fontSize: 13,
  fontFamily: "var(--font-geist-mono), ui-monospace, Menlo, monospace",
  minimap: { enabled: false },
  scrollBeyondLastLine: false,
  padding: { top: 12, bottom: 12 },
  automaticLayout: true,
  tabSize: 2,
  renderLineHighlight: "line",
  cursorBlinking: "smooth",
} as const;
