"use client";

import { useEffect, useRef, useState, type Ref } from "react";
import Editor, { type Monaco, type OnMount } from "@monaco-editor/react";
import type { editor as MonacoEditor } from "monaco-editor";
import type { Awareness } from "y-protocols/awareness";
import type * as Y from "yjs";
import { MonacoBinding } from "@/lib/collab/monaco-binding";
import type { LanguageId } from "@/lib/types";
import { languageMeta } from "@/lib/languages";

export type CodePaneHandle = {
  revealPeer: (clientId: number) => boolean;
  revealLine: (line: number, column?: number) => void;
  setErrorLine: (line: number | null, message?: string) => void;
};

export function CodePane({
  language,
  code,
  onChange,
  ytext,
  awareness,
  followClientId = null,
  onFollowed,
  onFocus,
  ref,
}: {
  language: LanguageId;
  code: string;
  onChange: (value: string) => void;
  ytext?: Y.Text | null;
  awareness?: Awareness | null;
  followClientId?: number | null;
  onFollowed?: () => void;
  onFocus?: () => void;
  ref?: Ref<CodePaneHandle>;
}) {
  const meta = languageMeta(language);
  const [editor, setEditor] = useState<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const monacoRef = useRef<Monaco | null>(null);
  const editorRef = useRef<MonacoEditor.IStandaloneCodeEditor | null>(null);
  const bindingRef = useRef<MonacoBinding | null>(null);
  const onFocusRef = useRef(onFocus);
  const onFollowedRef = useRef(onFollowed);
  const live = Boolean(ytext && awareness);
  onFocusRef.current = onFocus;
  onFollowedRef.current = onFollowed;

  useEffect(() => {
    editorRef.current = editor;
  }, [editor]);

  useEffect(() => {
    const handle: CodePaneHandle = {
      revealPeer: (clientId) => bindingRef.current?.revealPeer(clientId) ?? false,
      revealLine: (line, column) => {
        const ed = editorRef.current;
        if (!ed) return;
        const model = ed.getModel();
        if (!model) return;
        const lineNumber = Math.min(Math.max(1, line), model.getLineCount());
        const col = Math.min(
          Math.max(1, column ?? 1),
          model.getLineMaxColumn(lineNumber),
        );
        ed.revealLineInCenter(lineNumber);
        ed.setPosition({ lineNumber, column: col });
        ed.focus();
      },
      setErrorLine: (line, message) => {
        const ed = editorRef.current;
        const monaco = monacoRef.current;
        if (!ed || !monaco) return;
        const model = ed.getModel();
        if (!model) return;
        if (line == null) {
          monaco.editor.setModelMarkers(model, "idecoder-runtime", []);
          return;
        }
        const lineNumber = Math.min(Math.max(1, line), model.getLineCount());
        monaco.editor.setModelMarkers(model, "idecoder-runtime", [
          {
            startLineNumber: lineNumber,
            startColumn: 1,
            endLineNumber: lineNumber,
            endColumn: model.getLineMaxColumn(lineNumber),
            message: message || "Runtime error",
            severity: monaco.MarkerSeverity.Error,
          },
        ]);
      },
    };
    if (typeof ref === "function") ref(handle);
    else if (ref) ref.current = handle;
    return () => {
      if (typeof ref === "function") ref(null);
      else if (ref) ref.current = null;
    };
  }, [ref]);

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

  useEffect(() => {
    if (followClientId == null || !bindingRef.current) return;
    const ok = bindingRef.current.revealPeer(followClientId);
    if (ok) onFollowedRef.current?.();
  }, [followClientId, editor, ytext]);

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
    instance.onDidFocusEditorWidget(() => onFocusRef.current?.());
    editorRef.current = instance;
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
