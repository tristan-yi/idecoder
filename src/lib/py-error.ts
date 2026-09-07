/**
 * CoderPad/LeetCode-style Python traces: keep the user's frames, drop Pyodide
 * internals, and name the file solution.py instead of <exec>.
 */
export function tidyPythonTrace(text: string): string {
  const raw = String(text || "")
    .replace(/^PythonError:\s*/i, "")
    .trim();
  if (!raw) return "";

  const lines = raw.split("\n").map((line) =>
    line
      .replace(/File "<exec>"/g, 'File "solution.py"')
      .replace(/File "<string>"/g, 'File "solution.py"')
      .replace(/File "<stdin>"/g, 'File "solution.py"'),
  );

  const kept: string[] = [];
  let dropNext = false;
  for (const line of lines) {
    if (dropNext) {
      dropNext = false;
      if (/^\s+/.test(line) && !line.includes('File "')) continue;
    }
    if (isInternalFrame(line)) {
      dropNext = /^\s*File /.test(line);
      continue;
    }
    kept.push(line);
  }

  const cleaned = kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
  return cleaned || raw;
}

function isInternalFrame(line: string) {
  return (
    line.includes("/lib/python") ||
    line.includes("pyodide/_package_loader") ||
    line.includes("pyodide/_base") ||
    line.includes("_pyodide/") ||
    line.includes("importlib._bootstrap") ||
    line.includes("pyodide.ffi")
  );
}
