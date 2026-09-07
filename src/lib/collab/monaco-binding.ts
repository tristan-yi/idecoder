import { createMutex } from "lib0/mutex";
import type { Awareness } from "y-protocols/awareness";
import type * as Monaco from "monaco-editor";
import * as Y from "yjs";

type MonacoApi = typeof Monaco;

class RelativeSelection {
  constructor(
    readonly start: Y.RelativePosition,
    readonly end: Y.RelativePosition,
    readonly direction: Monaco.SelectionDirection,
  ) {}
}

export class MonacoBinding {
  doc: Y.Doc;
  ytext: Y.Text;
  monacoModel: Monaco.editor.ITextModel;
  editors: Set<Monaco.editor.IStandaloneCodeEditor>;
  awareness: Awareness | null;
  private monaco: MonacoApi;
  private mux = createMutex();
  private savedSelections = new Map<
    Monaco.editor.IStandaloneCodeEditor,
    RelativeSelection
  >();
  private decorations = new Map<Monaco.editor.IStandaloneCodeEditor, string[]>();
  private monacoChangeHandler: Monaco.IDisposable;
  private monacoDisposeHandler: Monaco.IDisposable;

  constructor(
    ytext: Y.Text,
    monacoModel: Monaco.editor.ITextModel,
    editors: Set<Monaco.editor.IStandaloneCodeEditor>,
    awareness: Awareness | null,
    monaco: MonacoApi,
  ) {
    this.doc = ytext.doc as Y.Doc;
    this.ytext = ytext;
    this.monacoModel = monacoModel;
    this.editors = editors;
    this.awareness = awareness;
    this.monaco = monaco;

    this.doc.on("beforeAllTransactions", this.beforeTransaction);
    ytext.observe(this.onYTextEvent);
    if (monacoModel.getValue() !== ytext.toString()) {
      monacoModel.setValue(ytext.toString());
    }
    this.monacoChangeHandler = monacoModel.onDidChangeContent((event) => {
      this.mux(() => {
        this.doc.transact(() => {
          [...event.changes]
            .sort((a, b) => b.rangeOffset - a.rangeOffset)
            .forEach((change) => {
              ytext.delete(change.rangeOffset, change.rangeLength);
              ytext.insert(change.rangeOffset, change.text);
            });
        }, this);
      });
    });
    this.monacoDisposeHandler = monacoModel.onWillDispose(() => {
      this.destroy();
    });

    if (awareness) {
      editors.forEach((editor) => {
        editor.onDidChangeCursorSelection(() => {
          if (editor.getModel() !== monacoModel) return;
          const sel = editor.getSelection();
          if (!sel) return;
          let anchor = monacoModel.getOffsetAt(sel.getStartPosition());
          let head = monacoModel.getOffsetAt(sel.getEndPosition());
          if (sel.getDirection() === monaco.SelectionDirection.RTL) {
            const tmp = anchor;
            anchor = head;
            head = tmp;
          }
          awareness.setLocalStateField("selection", {
            anchor: Y.createRelativePositionFromTypeIndex(ytext, anchor),
            head: Y.createRelativePositionFromTypeIndex(ytext, head),
          });
        });
      });
      awareness.on("change", this.rerenderDecorations);
      this.rerenderDecorations();
    }
  }

  revealPeer(clientId: number): boolean {
    const editor = [...this.editors][0];
    if (!editor || !this.awareness) return false;
    const state = this.awareness.getStates().get(clientId);
    if (!state?.selection) return false;
    const { head, anchor } = state.selection as {
      anchor?: Y.RelativePosition;
      head?: Y.RelativePosition;
    };
    const target = head ?? anchor;
    if (!target) return false;
    const abs = Y.createAbsolutePositionFromRelativePosition(target, this.doc);
    if (!abs || abs.type !== this.ytext) return false;
    const pos = this.monacoModel.getPositionAt(abs.index);
    editor.revealPositionInCenter(pos);
    const flash = editor.deltaDecorations([], [
      {
        range: new this.monaco.Range(
          pos.lineNumber,
          1,
          pos.lineNumber,
          this.monacoModel.getLineMaxColumn(pos.lineNumber),
        ),
        options: {
          isWholeLine: true,
          className: "yRemotePeek",
        },
      },
    ]);
    window.setTimeout(() => {
      editor.deltaDecorations(flash, []);
    }, 1600);
    return true;
  }

  destroy() {
    this.monacoChangeHandler.dispose();
    this.monacoDisposeHandler.dispose();
    this.ytext.unobserve(this.onYTextEvent);
    this.doc.off("beforeAllTransactions", this.beforeTransaction);
    this.awareness?.off("change", this.rerenderDecorations);
  }

  private beforeTransaction = () => {
    this.mux(() => {
      this.savedSelections = new Map();
      this.editors.forEach((editor) => {
        if (editor.getModel() !== this.monacoModel) return;
        const sel = editor.getSelection();
        if (!sel) return;
        this.savedSelections.set(
          editor,
          new RelativeSelection(
            Y.createRelativePositionFromTypeIndex(
              this.ytext,
              this.monacoModel.getOffsetAt(sel.getStartPosition()),
            ),
            Y.createRelativePositionFromTypeIndex(
              this.ytext,
              this.monacoModel.getOffsetAt(sel.getEndPosition()),
            ),
            sel.getDirection(),
          ),
        );
      });
    });
  };

  private onYTextEvent = (event: Y.YTextEvent) => {
    this.mux(() => {
      let index = 0;
      event.delta.forEach((op) => {
        if (op.retain !== undefined) {
          index += op.retain;
        } else if (op.insert !== undefined) {
          const pos = this.monacoModel.getPositionAt(index);
          const insert = String(op.insert);
          this.monacoModel.applyEdits([
            {
              range: new this.monaco.Range(
                pos.lineNumber,
                pos.column,
                pos.lineNumber,
                pos.column,
              ),
              text: insert,
            },
          ]);
          index += insert.length;
        } else if (op.delete !== undefined) {
          const pos = this.monacoModel.getPositionAt(index);
          const endPos = this.monacoModel.getPositionAt(index + op.delete);
          this.monacoModel.applyEdits([
            {
              range: new this.monaco.Range(
                pos.lineNumber,
                pos.column,
                endPos.lineNumber,
                endPos.column,
              ),
              text: "",
            },
          ]);
        }
      });
      this.savedSelections.forEach((relSel, editor) => {
        const start = Y.createAbsolutePositionFromRelativePosition(
          relSel.start,
          this.doc,
        );
        const end = Y.createAbsolutePositionFromRelativePosition(
          relSel.end,
          this.doc,
        );
        if (
          !start ||
          !end ||
          start.type !== this.ytext ||
          end.type !== this.ytext
        ) {
          return;
        }
        const startPos = this.monacoModel.getPositionAt(start.index);
        const endPos = this.monacoModel.getPositionAt(end.index);
        editor.setSelection(
          this.monaco.Selection.createWithDirection(
            startPos.lineNumber,
            startPos.column,
            endPos.lineNumber,
            endPos.column,
            relSel.direction,
          ),
        );
      });
    });
    this.rerenderDecorations();
  };

  private rerenderDecorations = () => {
    const { awareness, monacoModel, ytext } = this;
    this.editors.forEach((editor) => {
      if (!awareness || editor.getModel() !== monacoModel) {
        this.decorations.delete(editor);
        return;
      }
      const next: Monaco.editor.IModelDeltaDecoration[] = [];
      awareness.getStates().forEach((state, clientID) => {
        if (clientID === this.doc.clientID || !state.selection) return;
        const { anchor, head } = state.selection as {
          anchor?: Y.RelativePosition;
          head?: Y.RelativePosition;
        };
        if (!anchor || !head) return;
        const anchorAbs = Y.createAbsolutePositionFromRelativePosition(
          anchor,
          this.doc,
        );
        const headAbs = Y.createAbsolutePositionFromRelativePosition(
          head,
          this.doc,
        );
        if (
          !anchorAbs ||
          !headAbs ||
          anchorAbs.type !== ytext ||
          headAbs.type !== ytext
        ) {
          return;
        }
        const forward = anchorAbs.index < headAbs.index;
        const start = monacoModel.getPositionAt(
          forward ? anchorAbs.index : headAbs.index,
        );
        const end = monacoModel.getPositionAt(
          forward ? headAbs.index : anchorAbs.index,
        );
        next.push({
          range: new this.monaco.Range(
            start.lineNumber,
            start.column,
            end.lineNumber,
            end.column,
          ),
          options: {
            className: `yRemoteSelection yRemoteSelection-${clientID}`,
            afterContentClassName: forward
              ? `yRemoteSelectionHead yRemoteSelectionHead-${clientID}`
              : null,
            beforeContentClassName: forward
              ? null
              : `yRemoteSelectionHead yRemoteSelectionHead-${clientID}`,
          },
        });
      });
      this.decorations.set(
        editor,
        editor.deltaDecorations(this.decorations.get(editor) || [], next),
      );
    });
  };
}
