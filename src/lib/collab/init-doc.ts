import * as Y from "yjs";
import { LANGUAGES } from "@/lib/languages";
import type { Session } from "@/lib/types";
import { toB64 } from "./bytes";
import { codeKey, META_KEY, NOTES_KEY } from "./fields";

export function encodeInitialDoc(session: Session): string {
  const doc = new Y.Doc();
  const meta = doc.getMap(META_KEY);
  meta.set("language", session.language);
  for (const lang of LANGUAGES) {
    const code =
      session.codeByLanguage[lang.id] ??
      session.problem.starterCode[lang.id] ??
      "";
    if (code) doc.getText(codeKey(lang.id)).insert(0, code);
  }
  const notes = session.notes?.trim();
  if (notes) doc.getText(NOTES_KEY).insert(0, notes);
  const encoded = toB64(Y.encodeStateAsUpdate(doc));
  doc.destroy();
  return encoded;
}

export function seedDoc(doc: Y.Doc, session: Session) {
  doc.transact(() => {
    const meta = doc.getMap(META_KEY);
    if (!meta.has("language")) meta.set("language", session.language);
    for (const lang of LANGUAGES) {
      const text = doc.getText(codeKey(lang.id));
      if (text.length > 0) continue;
      const code =
        session.codeByLanguage[lang.id] ??
        session.problem.starterCode[lang.id] ??
        "";
      if (code) text.insert(0, code);
    }
    const notes = doc.getText(NOTES_KEY);
    if (notes.length === 0 && session.notes) notes.insert(0, session.notes);
  }, "seed");
}
