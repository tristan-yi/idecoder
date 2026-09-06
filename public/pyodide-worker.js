/**
 * Python execution worker for the practice pads.
 *
 * Must be spawned as a module worker (`new Worker(url, { type: "module" })`).
 * Pyodide 314+ refuses classic workers: it detects `importScripts` and throws
 * "Classic web workers are not supported". The ESM build is loaded with a
 * dynamic import so the versioned index URL can stay a query parameter.
 *
 * Protocol
 *   in : { type: "warmup" } | { type: "run", code: string }
 *   out: { type: "progress", stage: "downloading" | "starting" | "ready" }
 *        { type: "warm" }
 *        { type: "done", ok: boolean, stdout: string, stderr: string }
 */

const params = new URLSearchParams(self.location.search);
const INDEX_URL =
  params.get("indexURL") || "https://cdn.jsdelivr.net/pyodide/v314.0.6/full/";

let readyPromise = null;
let out = [];
let err = [];

function ensure() {
  if (readyPromise) return readyPromise;
  readyPromise = (async () => {
    self.postMessage({ type: "progress", stage: "downloading" });
    const { loadPyodide } = await import(/* webpackIgnore: true */ INDEX_URL + "pyodide.mjs");
    self.postMessage({ type: "progress", stage: "starting" });
    const py = await loadPyodide({
      indexURL: INDEX_URL,
      stdout: (line) => out.push(line),
      stderr: (line) => err.push(line),
    });
    self.postMessage({ type: "progress", stage: "ready" });
    return py;
  })();
  return readyPromise;
}

function tidy(text) {
  const lines = String(text).split("\n");
  const kept = lines.filter(
    (line) =>
      !line.includes("/lib/python3") &&
      !line.includes("pyodide/_package_loader") &&
      !line.includes("importlib._bootstrap"),
  );
  return (kept.length ? kept : lines).join("\n").trim();
}

self.onmessage = async (event) => {
  const data = event.data || {};

  let py;
  try {
    py = await ensure();
  } catch (loadError) {
    self.postMessage({
      type: "done",
      ok: false,
      stdout: "",
      stderr:
        "Could not load the Python runtime from the CDN. Check your connection and try again.\n" +
        String(loadError),
    });
    return;
  }

  if (data.type === "warmup") {
    self.postMessage({ type: "warm" });
    return;
  }

  out = [];
  err = [];
  const ns = py.runPython("{'__name__': '__main__'}");
  try {
    await py.runPythonAsync(data.code, { globals: ns });
    self.postMessage({
      type: "done",
      ok: true,
      stdout: out.join("\n"),
      stderr: err.join("\n"),
    });
  } catch (runError) {
    self.postMessage({
      type: "done",
      ok: false,
      stdout: out.join("\n"),
      stderr: tidy(err.join("\n") + "\n" + String(runError)),
    });
  } finally {
    ns.destroy();
  }
};
