"use client";

import { useEffect, useRef, useState } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { MonacoBinding } from "@/lib/collab/monaco-binding";
import type { LanguageId } from "@/lib/types";
import { languageMeta } from "@/lib/languages";

export function CodePane({
  language,
  code,
  onChange,
  ytext,
  awareness,
}: {
  language: LanguageId;
  code: string;
  onChange: (value: string) => void;
  ytext?: Y.Text | null;
  awareness?: Awareness | null;
}) {
  const meta = languageMeta(language);
  const [editor, setEditor] = useState<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const live = Boolean(ytext && awareness);

  useEffect(() => {
    const monaco = monacoRef.current;
    if (!editor || !ytext || !awareness || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    bindingRef.current?.destroy();
    bindingRef.current = new MonacoBinding(
      ytext,
      model,
      new Set([editor]),
      awareness,
      monaco,
    );
    return () => {
      bindingRef.current?.destroy();
      bindingRef.current = null;
    };
  }, [editor, ytext, awareness]);

  const handleMount: OnMount = (instance, monaco) => {
    monacoRef.current = monaco;
    monaco.editor.defineTheme("idecoder", {
      base: "vs-dark",
      inherit: true,
      rules: [],
      colors: {
        "editor.background": "#0e1116",
        "editor.lineHighlightBackground": "#161b22",
        "editorGutter.background": "#0e1116",
      },
    });
    monaco.editor.setTheme("idecoder");
    instance.updateOptions({
      fontSize: 14,
      fontFamily: "var(--font-geist-mono), ui-monospace, Menlo, monospace",
      minimap: { enabled: false },
      scrollBeyondLastLine: false,
      padding: { top: 12, bottom: 12 },
      automaticLayout: true,
      tabSize: 4,
      renderLineHighlight: "line",
      cursorBlinking: "smooth",
    });
    setEditor(instance);
  };

  return (
    <div className="h-full bg-[#0e1116]">
      <Editor
        height="100%"
        theme="idecoder"
        language={meta.monaco}
        value={live ? undefined : code}
        onChange={live ? undefined : (value) => onChange(value ?? "")}
        onMount={handleMount}
        loading={
          <div className="flex h-full items-center justify-center text-sm text-mute">
            Loading editor…
          </div>
        }
      />
    </div>
  );
}
