import type { Awareness } from "y-protocols/awareness";
import * as Y from "yjs";
import { LANGUAGES, isLanguageId, languageMeta } from "@/lib/languages";
import type { LanguageId } from "@/lib/types";
import { NOTES_KEY, codeKey } from "./fields";

export type PeerSurface = "code" | "notes";

export type PeerPlace = {
  surface: PeerSurface;
  language?: LanguageId;
  line: number | null;
};

function lineAt(text: string, index: number) {
  let line = 1;
  const end = Math.max(0, Math.min(index, text.length));
  for (let i = 0; i < end; i++) {
    if (text[i] === "\n") line += 1;
  }
  return line;
}

export function peerPlace(
  awareness: Awareness,
  clientId: number,
  doc: Y.Doc,
): PeerPlace | null {
  const state = awareness.getStates().get(clientId);
  if (!state) return null;
  const language = isLanguageId(state.language) ? state.language : undefined;
  const markedNotes = state.surface === "notes";

  const selection = state.selection as { head?: Y.RelativePosition } | undefined;
  if (selection?.head) {
    const abs = Y.createAbsolutePositionFromRelativePosition(selection.head, doc);
    if (abs) {
      const notes = doc.getText(NOTES_KEY);
      if (abs.type === notes) {
        return {
          surface: "notes",
          language,
          line: lineAt(notes.toString(), abs.index),
        };
      }
      for (const lang of LANGUAGES) {
        const ytext = doc.getText(codeKey(lang.id));
        if (abs.type === ytext) {
          return {
            surface: "code",
            language: lang.id,
            line: lineAt(ytext.toString(), abs.index),
          };
        }
      }
    }
  }

  if (markedNotes) return { surface: "notes", language, line: null };
  return { surface: "code", language, line: null };
}

export function formatPeerPlace(place: PeerPlace | null) {
  if (!place) return "Waiting for a cursor…";
  if (place.surface === "notes") {
    return place.line ? `Notes · line ${place.line}` : "In notes";
  }
  const lang = place.language
    ? languageMeta(place.language).label.replace(/ \(editor only\)/, "")
    : "Code";
  if (place.line) return `${lang} · line ${place.line}`;
  return `In ${lang}`;
}
