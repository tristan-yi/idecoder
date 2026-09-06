import type * as Y from "yjs";

export function bindYTextToTextarea(ytext: Y.Text, textarea: HTMLTextAreaElement) {
  const applyRemote = () => {
    const next = ytext.toString();
    if (textarea.value === next) return;
    const prev = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    textarea.value = next;
    let prefix = 0;
    while (prefix < prev.length && prefix < next.length && prev[prefix] === next[prefix]) {
      prefix += 1;
    }
    if (start <= prefix) {
      textarea.setSelectionRange(start, end);
    } else {
      const delta = next.length - prev.length;
      textarea.setSelectionRange(Math.max(0, start + delta), Math.max(0, end + delta));
    }
  };

  const observer = (_event: unknown, transaction: { origin: unknown }) => {
    if (transaction.origin === textarea) return;
    applyRemote();
  };

  ytext.observe(observer);
  textarea.value = ytext.toString();

  const onInput = () => {
    const oldValue = ytext.toString();
    const next = textarea.value;
    if (oldValue === next) return;
    let start = 0;
    while (start < oldValue.length && start < next.length && oldValue[start] === next[start]) {
      start += 1;
    }
    let oldEnd = oldValue.length - 1;
    let nextEnd = next.length - 1;
    while (oldEnd >= start && nextEnd >= start && oldValue[oldEnd] === next[nextEnd]) {
      oldEnd -= 1;
      nextEnd -= 1;
    }
    ytext.doc?.transact(() => {
      const deleteCount = oldEnd - start + 1;
      if (deleteCount > 0) ytext.delete(start, deleteCount);
      const insert = next.slice(start, nextEnd + 1);
      if (insert) ytext.insert(start, insert);
    }, textarea);
  };

  textarea.addEventListener("input", onInput);
  return () => {
    ytext.unobserve(observer);
    textarea.removeEventListener("input", onInput);
  };
}
