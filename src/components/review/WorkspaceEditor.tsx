"use client";

import Editor, { type OnMount } from "@monaco-editor/react";
import { X } from "lucide-react";
import { FileTree } from "./FileTree";
import { EDITOR_OPTIONS, THEME, defineTheme } from "./monaco";
import { fileLanguage, type SeedFile } from "@/lib/review/types";

export function WorkspaceEditor({
  files,
  originals,
  activePath,
  openPaths,
  onOpen,
  onClose,
  onChange,
}: {
  files: SeedFile[];
  originals: SeedFile[];
  activePath: string;
  openPaths: string[];
  onOpen: (path: string) => void;
  onClose: (path: string) => void;
  onChange: (path: string, contents: string) => void;
}) {
  const active = files.find((f) => f.path === activePath) ?? files[0];

  const handleMount: OnMount = (editor, monaco) => {
    defineTheme(monaco);
    monaco.editor.setTheme(THEME);
    monaco.languages.typescript.typescriptDefaults.setDiagnosticsOptions({
      noSemanticValidation: true,
      noSyntaxValidation: false,
    });
    editor.updateOptions(EDITOR_OPTIONS);
  };

  return (
    <div className="flex h-full min-h-0">
      <FileTree
        files={files}
        originals={originals}
        activePath={activePath}
        onOpen={onOpen}
      />

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 shrink-0 items-stretch overflow-x-auto border-b border-line bg-panel">
          {openPaths.map((path) => (
            <div
              key={path}
              className={`group flex items-center gap-1.5 border-r border-line px-3 text-[12.5px] ${
                path === activePath ? "bg-[#0e1116] text-white" : "text-mute"
              }`}
            >
              <button
                type="button"
                onClick={() => onOpen(path)}
                className="whitespace-nowrap"
              >
                {path.split("/").pop()}
              </button>
              <button
                type="button"
                onClick={() => onClose(path)}
                aria-label={`Close ${path}`}
                className="rounded p-0.5 opacity-0 hover:bg-white/10 group-hover:opacity-100"
              >
                <X size={11} />
              </button>
            </div>
          ))}
        </div>

        <div className="min-h-0 flex-1 bg-[#0e1116]">
          {active ? (
            <Editor
              height="100%"
              theme={THEME}
              path={active.path}
              language={fileLanguage(active.path)}
              value={active.contents}
              onChange={(value) => onChange(active.path, value ?? "")}
              onMount={handleMount}
              options={EDITOR_OPTIONS}
              loading={
                <div className="flex h-full items-center justify-center text-sm text-mute">
                  Loading editor…
                </div>
              }
            />
          ) : (
            <div className="flex h-full items-center justify-center text-sm text-mute">
              Pick a file
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
