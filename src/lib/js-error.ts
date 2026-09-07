/**
 * Turns a JS Error.stack into something closer to CoderPad: user frames
 * point at solution.js, harness frames are dropped.
 *
 * `new Function("console", code)` wraps the source in `function anonymous(console) { ... }`,
 * so engine line numbers are 1 greater than the user's file.
 */
export function formatJavascriptErrorText(
  stackOrMessage: string,
  wrapperLines = 1,
): string {
  const raw = String(stackOrMessage || "").trim();
  if (!raw) return "";
  const mapped = raw.split("\n").flatMap((line) => {
    if (line.includes("__idc")) return [];
    const next = line.replace(
      /\(Function:(\d+):(\d+)\)|<anonymous>:(\d+):(\d+)/g,
      (match, a, b, c, d) => {
        const lineNo = Number(a || c);
        const col = a ? b : d;
        const userLine = Math.max(1, lineNo - wrapperLines);
        return match.includes("Function:")
          ? `(solution.js:${userLine}:${col})`
          : `solution.js:${userLine}:${col}`;
      },
    );
    return [next];
  });
  return mapped.join("\n").trim() || raw;
}

export function javascriptErrorFromUnknown(err: unknown): string {
  if (err && typeof err === "object") {
    const stack = "stack" in err && typeof err.stack === "string" ? err.stack : "";
    if (stack) return formatJavascriptErrorText(stack);
    if ("message" in err && err.message != null) {
      const name = "name" in err && err.name ? String(err.name) : "Error";
      return `${name}: ${String(err.message)}`;
    }
  }
  return String(err);
}
